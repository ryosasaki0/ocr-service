/**
 * Google Cloud Document AI 実行スクリプト
 */

require('dotenv').config()

const { DocumentProcessorServiceClient } =
  require('@google-cloud/documentai').v1
const fs = require('fs').promises
const path = require('path')

// --- 設定項目 (環境変数から読み込み) ---
const projectId = process.env.PROJECT_ID
const location = process.env.LOCATION || 'us'
const processorId = process.env.PROCESSOR_ID
const keyFilePath = process.env.KEY_FILE_PATH
const filePath = './エスラインギフ.pdf'
// ----------------------------------------

async function processDocument() {
  // 認証情報のチェック
  console.log(projectId)
  if (!keyFilePath) {
    console.error('エラー: 認証情報が設定されていません。')
    console.error('以下のいずれかを設定してください:')
    console.error('  1. 環境変数 KEY_FILE_PATH (サービスアカウントキーのパス)')
    console.error('  2. 環境変数 GOOGLE_APPLICATION_CREDENTIALS')
    console.error('詳細は README.md を参照してください。')
    process.exit(1)
  }

  // 設定値のチェック
  if (projectId === 'YOUR_PROJECT_ID' || processorId === 'YOUR_PROCESSOR_ID') {
    console.error('エラー: PROJECT_ID と PROCESSOR_ID を設定してください。')
    console.error('.env ファイルで環境変数を設定してください。')
    console.error('詳細は README.md を参照してください。')
    process.exit(1)
  }

  // 1. クライアントの初期化
  const clientOptions = keyFilePath ? { keyFilename: keyFilePath } : {}
  const client = new DocumentProcessorServiceClient(clientOptions)

  // 2. 完全なリソース名を作成
  const name = `projects/${projectId}/locations/${location}/processors/${processorId}`

  try {
    // 3. 画像ファイルの読み込み
    const imageFile = await fs.readFile(filePath)
    const encodedImage = imageFile.toString('base64')

    // ファイル拡張子から MIME タイプを自動判定
    const mimeType = filePath.toLowerCase().endsWith('.pdf')
      ? 'application/pdf'
      : filePath.toLowerCase().endsWith('.png')
      ? 'image/png'
      : 'image/jpeg'

    // 4. リクエストデータの作成
    const request = {
      name,
      rawDocument: {
        content: encodedImage,
        mimeType: mimeType,
      },
      skipHumanReview: true,
    }

    console.log('Document AI にリクエスト送信中...')

    // 5. APIリクエストの実行
    const [result] = await client.processDocument(request)
    const { document } = result

    console.log('解析完了。結果を出力します。\n')
    console.log('========================================')

    // 6. 結果の表示
    if (document.pages && document.pages.length > 0) {
      const page = document.pages[0]

      if (page.formFields && page.formFields.length > 0) {
        page.formFields.forEach((field) => {
          const key = getText(field.fieldName, document.text).trim()
          const value = getText(field.fieldValue, document.text).trim()
          const confidence = field.fieldValue.confidence

          console.log(`項目名: ${key}`)
          console.log(`値    : ${value}`)
          console.log(`信頼度: ${(confidence * 100).toFixed(1)}%`)
          console.log('----------------------------------------')
        })
      } else {
        console.log('フォームフィールドが検出されませんでした。')
        console.log('全文テキスト:', document.text)
      }
    }
  } catch (error) {
    console.error('エラーが発生しました:', error)
    process.exit(1)
  }
}

// ヘルパー関数
function getText(layoutField, fullText) {
  if (
    !layoutField ||
    !layoutField.textAnchor ||
    !layoutField.textAnchor.textSegments
  ) {
    return ''
  }

  return layoutField.textAnchor.textSegments
    .map((segment) => {
      const start = segment.startIndex || 0
      const end = segment.endIndex
      return fullText.substring(start, end)
    })
    .join('')
}

// 実行
processDocument()
