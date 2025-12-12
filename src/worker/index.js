/**
 * OCR Worker
 * Pub/Subからメッセージを受信してDocument AI処理を実行
 */
require('dotenv').config()
const express = require('express')
const { PubSub } = require('@google-cloud/pubsub')
const firestoreService = require('../services/firestoreService')
const storageService = require('../services/storageService')
const documentAIService = require('../services/documentAIService')

const app = express()
const PORT = process.env.WORKER_PORT || 8081

// JSONボディのパース
app.use(express.json())

// Pub/Sub クライアント
const pubsub = new PubSub({
  keyFilename: process.env.KEY_FILE_PATH,
  projectId: process.env.PROJECT_ID,
})
const subscriptionName =
  process.env.PUBSUB_SUBSCRIPTION_NAME || 'ocr-requests-sub'

// ヘルスチェック
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'ocr-worker' })
})

/**
 * Pub/Sub Push エンドポイント (Cloud Run用)
 */
app.post('/', async (req, res) => {
  try {
    if (!req.body || !req.body.message) {
      console.error('Invalid Pub/Sub message format')
      return res.status(400).send('Bad Request: Invalid message format')
    }

    const message = req.body.message
    const data = message.data
      ? Buffer.from(message.data, 'base64').toString()
      : '{}'
    const messageData = JSON.parse(data)

    const { documentId } = messageData

    if (!documentId) {
      console.error('Missing documentId in message')
      return res.status(400).send('Bad Request: Missing documentId')
    }

    console.log(`\n========================================`)
    console.log(`Processing document: ${documentId}`)
    console.log(`Message ID: ${message.messageId}`)
    console.log(`========================================`)

    await processOCRDocument(documentId)

    res.status(200).send('OK')
  } catch (error) {
    console.error('Error in Pub/Sub handler:', error)
    res.status(200).send('Processed with errors')
  }
})

/**
 * OCRドキュメント処理のメインロジック
 */
async function processOCRDocument(documentId) {
  try {
    console.log(`\n[1] Fetching document from Firestore...`)
    const document = await firestoreService.getDocument(documentId)

    console.log(`Document details:`)
    console.log(`  - File: ${document.originalFileName}`)
    console.log(`  - Type: ${document.fileType}`)
    console.log(`  - Status: ${document.status}`)
    console.log(`  - GCS Path: ${document.gcsPath}`)

    if (document.status !== 'pending') {
      console.log(`⚠ Document status is '${document.status}', skipping...`)
      return
    }

    console.log(`\n[2] Updating status to 'processing'...`)
    await firestoreService.updateDocumentStatus(documentId, 'processing')

    console.log(`\n[3] Downloading file from GCS...`)
    const fileBuffer = await storageService.downloadFile(document.gcsPath)
    console.log(`✓ File downloaded: ${fileBuffer.length} bytes`)

    const mimeType = getMimeType(document.fileType, document.gcsPath)
    console.log(`MIME Type: ${mimeType}`)

    console.log(`\n[4] Processing with Document AI...`)
    const ocrResult = await documentAIService.processDocument(
      fileBuffer,
      mimeType
    )

    console.log(`\n[5] Saving OCR result to Firestore...`)
    await firestoreService.updateDocumentStatus(documentId, 'completed', {
      ocrResult: ocrResult,
    })
    console.log(`✓ Document completed: ${documentId}`)

    console.log(`\n[6] Updating batch progress...`)
    await firestoreService.incrementBatchProcessed(document.batchId)

    console.log(`\n[7] Checking if batch is complete...`)
    await checkAndCompleteBatch(document.batchId)

    console.log(`\n✓ Successfully processed document: ${documentId}`)
  } catch (error) {
    console.error(`\n✗ Error processing document ${documentId}:`, error)

    try {
      const document = await firestoreService.getDocument(documentId)
      await firestoreService.updateDocumentStatus(documentId, 'failed', {
        errorMessage: error.message,
      })

      await firestoreService.incrementBatchFailed(document.batchId)
      await checkAndCompleteBatch(document.batchId)
    } catch (updateError) {
      console.error('Failed to update error status:', updateError)
    }

    throw error
  }
}

async function checkAndCompleteBatch(batchId) {
  try {
    const batch = await firestoreService.getBatch(batchId)

    const totalProcessed = batch.processedDocuments + batch.failedDocuments

    console.log(
      `Batch progress: ${totalProcessed}/${batch.totalDocuments} (${batch.processedDocuments} completed, ${batch.failedDocuments} failed)`
    )

    if (totalProcessed >= batch.totalDocuments) {
      console.log(`✓ Batch ${batchId} is complete!`)
      await firestoreService.completeBatch(batchId)
    }
  } catch (error) {
    console.error('Error checking batch completion:', error)
  }
}

function getMimeType(fileType, gcsPath) {
  if (fileType === 'pdf') {
    return 'application/pdf'
  }

  const ext = gcsPath.split('.').pop().toLowerCase()
  if (ext === 'png') {
    return 'image/png'
  } else if (ext === 'jpg' || ext === 'jpeg') {
    return 'image/jpeg'
  }

  return 'image/jpeg'
}

/**
 * Pub/Sub Pull方式でメッセージを受信（ローカル開発用）
 */
function startPullSubscription() {
  const subscription = pubsub.subscription(subscriptionName)

  console.log(`\n========================================`)
  console.log(`Listening for messages on ${subscriptionName}...`)
  console.log(`========================================\n`)

  const messageHandler = async (message) => {
    try {
      const data = JSON.parse(message.data.toString())
      const { documentId } = data

      console.log(`\n========================================`)
      console.log(`Received message: ${message.id}`)
      console.log(`Document ID: ${documentId}`)
      console.log(`========================================`)

      await processOCRDocument(documentId)

      message.ack()
      console.log(`✓ Message acknowledged: ${message.id}`)
    } catch (error) {
      // ドキュメントが見つからない場合は、古いメッセージなのでackする
      if (error.message && error.message.includes('not found')) {
        console.log(`⚠ Document not found (old message), acknowledging...`)
        message.ack()
      } else {
        console.error('Error processing message:', error)
        message.nack()
      }
    }
  }

  subscription.on('message', messageHandler)
  subscription.on('error', (error) => {
    console.error('Subscription error:', error)
  })
}

// サーバー起動
app.listen(PORT, () => {
  console.log(`\n========================================`)
  console.log(`OCR Worker listening on port ${PORT}`)
  console.log(`Mode: Push endpoint (for Cloud Run)`)
  console.log(`========================================`)

  // ローカル開発用: Pull方式も同時起動
  if (process.env.NODE_ENV !== 'production') {
    console.log(`\nStarting Pull subscription for local development...`)
    startPullSubscription()
  }
})
