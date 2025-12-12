// src/services/documentAIService.js
/**
 * Document AI サービス
 */
const { DocumentProcessorServiceClient } =
  require('@google-cloud/documentai').v1

class DocumentAIService {
  constructor() {
    const keyFilePath = process.env.KEY_FILE_PATH
    const projectId = process.env.PROJECT_ID
    const location = process.env.LOCATION || 'us'
    const processorId = process.env.PROCESSOR_ID

    console.log('\n=== Document AI Configuration ===')
    console.log(`Project ID: ${projectId}`)
    console.log(`Location: ${location}`)
    console.log(`Processor ID: ${processorId}`)

    this.client = new DocumentProcessorServiceClient({
      keyFilename: keyFilePath,
    })

    this.processorName = `projects/${projectId}/locations/${location}/processors/${processorId}`
    console.log(`✓ Document AI client initialized`)
    console.log(`  Processor: ${this.processorName}`)
  }

  /**
   * OCR処理を実行
   * @param {Buffer} fileBuffer - ファイルのバッファ
   * @param {string} mimeType - MIMEタイプ (application/pdf, image/jpeg, image/png)
   * @returns {Promise<Object>} - 整形されたOCR結果
   */
  async processDocument(fileBuffer, mimeType) {
    console.log(`\n=== Processing Document with Document AI ===`)
    console.log(`MIME Type: ${mimeType}`)
    console.log(`File size: ${fileBuffer.length} bytes`)

    try {
      const encodedImage = fileBuffer.toString('base64')

      const request = {
        name: this.processorName,
        rawDocument: {
          content: encodedImage,
          mimeType: mimeType,
        },
        skipHumanReview: true,
      }

      console.log('Sending request to Document AI...')
      const [result] = await this.client.processDocument(request)
      const { document } = result

      console.log('✓ Document AI processing completed')

      // 結果を整形
      const ocrResult = this.formatResult(document)
      console.log(`Extracted ${Object.keys(ocrResult).length} fields`)

      return ocrResult
    } catch (error) {
      console.error('✗ Document AI processing failed:')
      console.error(`  Error: ${error.message}`)
      throw error
    }
  }

  /**
   * Document AI結果を整形
   * @param {Object} document - Document AIのdocumentオブジェクト
   * @returns {Object} - key-value形式のOCR結果
   */
  formatResult(document) {
    const result = {}

    if (document.pages && document.pages.length > 0) {
      const page = document.pages[0]

      if (page.formFields && page.formFields.length > 0) {
        // フォームフィールドがある場合
        page.formFields.forEach((field) => {
          const key = this.getText(field.fieldName, document.text).trim()
          const value = this.getText(field.fieldValue, document.text).trim()
          const confidence = field.fieldValue.confidence

          if (key) {
            result[key] = {
              value: value,
              confidence: confidence,
              // 座標情報を追加
              coordinates: {
                fieldName: this.getBoundingBox(field.fieldName),
                fieldValue: this.getBoundingBox(field.fieldValue),
              },
            }
          }
        })
      } else {
        // フォームフィールドがない場合は全文テキストを保存
        result['全文テキスト'] = {
          value: document.text || '',
          confidence: 1.0,
          coordinates: null,
        }
      }
    } else {
      // ページがない場合
      result['全文テキスト'] = {
        value: document.text || '',
        confidence: 1.0,
        coordinates: null,
      }
    }

    return result
  }

  /**
   * バウンディングボックス（座標）を取得
   * @param {Object} layoutField - Document AIのlayoutオブジェクト
   * @returns {Object|null} - 座標情報 {x, y, width, height} または null
   */
  getBoundingBox(layoutField) {
    if (
      !layoutField ||
      !layoutField.boundingPoly ||
      !layoutField.boundingPoly.normalizedVertices ||
      layoutField.boundingPoly.normalizedVertices.length === 0
    ) {
      return null
    }

    const vertices = layoutField.boundingPoly.normalizedVertices

    // 正規化座標 (0.0 ~ 1.0) から座標を取得
    // vertices[0] = 左上, vertices[1] = 右上, vertices[2] = 右下, vertices[3] = 左下
    const x = vertices[0].x || 0
    const y = vertices[0].y || 0
    const width = (vertices[1].x || 0) - x
    const height = (vertices[2].y || 0) - y

    return {
      // 正規化座標 (0.0 ~ 1.0)
      normalized: {
        x: x,
        y: y,
        width: width,
        height: height,
      },
      // 頂点座標（4点）
      vertices: vertices.map((v) => ({
        x: v.x || 0,
        y: v.y || 0,
      })),
    }
  }

  /**
   * テキストを抽出するヘルパー関数
   */
  getText(layoutField, fullText) {
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
}

module.exports = new DocumentAIService()
