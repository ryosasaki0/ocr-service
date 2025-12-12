/**
 * OCR API Server
 */
require('dotenv').config()
const express = require('express')
const multer = require('multer')
const { v4: uuidv4 } = require('uuid')
const path = require('path')

const storageService = require('../services/storageService')
const firestoreService = require('../services/firestoreService')
const pubsubPublisher = require('../services/pubsubPublisher')
const pdfSplitter = require('../utils/pdfSplitter')

const app = express()
const PORT = process.env.PORT || 8080

// ファイルサイズ制限 (MB)
const MAX_FILE_SIZE = (process.env.MAX_FILE_SIZE_MB || 20) * 1024 * 1024
const MAX_TOTAL_SIZE = (process.env.MAX_TOTAL_SIZE_MB || 100) * 1024 * 1024

// Multer設定 (メモリストレージ)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png']
    const ext = path.extname(file.originalname).toLowerCase()

    if (allowedExtensions.includes(ext)) {
      cb(null, true)
    } else {
      cb(new Error(`非対応のファイル形式です: ${ext}`))
    }
  },
})

// ヘルスチェック
app.get('/health', async (req, res) => {
  res.json({ status: 'ok', service: 'ocr-api' })
})

// ドキュメントアップロードエンドポイント
app.post('/documents', upload.array('files', 50), async (req, res) => {
  try {
    const { user_id, department } = req.body
    const files = req.files

    // バリデーション
    if (!user_id || !department) {
      return res.status(400).json({
        error: 'user_id と department は必須です',
      })
    }

    if (!files || files.length === 0) {
      return res.status(400).json({
        error: 'ファイルが指定されていません',
      })
    }

    // 合計ファイルサイズチェック
    const totalSize = files.reduce((sum, file) => sum + file.size, 0)
    if (totalSize > MAX_TOTAL_SIZE) {
      return res.status(400).json({
        error: `合計ファイルサイズが制限を超えています (最大: ${process.env.MAX_TOTAL_SIZE_MB}MB)`,
      })
    }

    // バッチID生成
    const batchId = uuidv4()
    const uploadedFiles = []
    const allDocuments = []
    const allDocumentIds = []

    // 各ファイルを処理
    for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
      const file = files[fileIndex]
      const ext = path.extname(file.originalname).toLowerCase()
      const fileType = ext === '.pdf' ? 'pdf' : 'image'

      let pageCount = 1
      let documentIds = []

      if (fileType === 'pdf') {
        // PDFの場合: ページ数取得 → 分割 → 各ページをアップロード
        pageCount = await pdfSplitter.getPageCount(file.buffer)
        const splitPages = await pdfSplitter.splitPdf(file.buffer)

        for (let pageNum = 0; pageNum < splitPages.length; pageNum++) {
          const documentId = uuidv4()
          const gcsPath = `uploads/${documentId}.pdf`

          // GCSにアップロード
          await storageService.uploadFile(splitPages[pageNum], gcsPath)

          // ドキュメント情報を作成
          allDocuments.push({
            documentId,
            batchId,
            userId: user_id,
            department,
            originalFileName: file.originalname,
            fileIndex,
            pageNum: pageNum + 1, // 1-indexed
            fileType: 'pdf',
            gcsPath,
          })

          documentIds.push(documentId)
          allDocumentIds.push(documentId)
        }
      } else {
        // 画像の場合: そのままアップロード
        const documentId = uuidv4()
        const gcsPath = `uploads/${documentId}${ext}`

        // GCSにアップロード
        await storageService.uploadFile(file.buffer, gcsPath)

        // ドキュメント情報を作成
        allDocuments.push({
          documentId,
          batchId,
          userId: user_id,
          department,
          originalFileName: file.originalname,
          fileIndex,
          pageNum: 1,
          fileType: 'image',
          gcsPath,
        })

        documentIds.push(documentId)
        allDocumentIds.push(documentId)
      }

      uploadedFiles.push({
        originalFileName: file.originalname,
        fileType,
        pageCount,
        documentIds,
      })
    }

    // Firestoreにバッチを作成
    await firestoreService.createBatch({
      batchId,
      userId: user_id,
      department,
      totalDocuments: allDocuments.length,
      processedDocuments: 0,
      failedDocuments: 0,
      uploadedFiles,
      status: 'processing',
    })

    // Firestoreにドキュメントを一括作成
    await firestoreService.createDocuments(allDocuments)

    // Pub/Subにメッセージを発行
    await pubsubPublisher.publishBulkOCRRequests(allDocumentIds)

    // レスポンス
    res.status(202).json({
      batchId,
      documents: allDocuments.map((doc) => ({
        documentId: doc.documentId,
        fileIndex: doc.fileIndex,
        pageNum: doc.pageNum,
        fileName: doc.originalFileName,
      })),
      totalDocuments: allDocuments.length,
      message: '受付完了',
    })
  } catch (error) {
    console.error('Error in /documents endpoint:', error)
    res.status(500).json({
      error: 'サーバーエラーが発生しました',
      message: error.message,
    })
  }
})

// サーバー起動
app.listen(PORT, () => {
  console.log(`OCR API Server listening on port ${PORT}`)
})
