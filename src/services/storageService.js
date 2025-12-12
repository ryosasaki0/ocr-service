/**
 * Cloud Storage サービス
 */
const { Storage } = require('@google-cloud/storage')
const path = require('path')

class StorageService {
  constructor() {
    const keyFilePath = process.env.KEY_FILE_PATH
    this.storage = new Storage({
      keyFilename: keyFilePath,
      projectId: process.env.PROJECT_ID,
    })
    this.bucketName = process.env.GCS_BUCKET_NAME
    this.bucket = this.storage.bucket(this.bucketName)
  }

  /**
   * ファイルをGCSにアップロード
   * @param {Buffer} fileBuffer - ファイルのバッファ
   * @param {string} destinationPath - GCS内の保存先パス (例: uploads/{documentId}.pdf)
   * @returns {Promise<string>} - GCSパス (gs://bucket-name/path)
   */
  async uploadFile(fileBuffer, destinationPath) {
    const file = this.bucket.file(destinationPath)

    await file.save(fileBuffer, {
      metadata: {
        contentType: this.getContentType(destinationPath),
      },
    })

    return `gs://${this.bucketName}/${destinationPath}`
  }

  /**
   * ファイル拡張子からContent-Typeを取得
   */
  getContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase()
    const contentTypes = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
    }
    return contentTypes[ext] || 'application/octet-stream'
  }

  /**
   * GCSからファイルをダウンロード
   * @param {string} gcsPath - GCSパス (gs://bucket-name/path)
   * @returns {Promise<Buffer>}
   */
  async downloadFile(gcsPath) {
    // gs://bucket-name/path から path部分を抽出
    const filePath = gcsPath.replace(`gs://${this.bucketName}/`, '')
    const file = this.bucket.file(filePath)
    const [buffer] = await file.download()
    return buffer
  }
}

module.exports = new StorageService()
