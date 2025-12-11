/**
 * Pub/Sub Publisher サービス
 */
const { PubSub } = require('@google-cloud/pubsub')

class PubSubPublisher {
  constructor() {
    const keyFilePath = process.env.KEY_FILE_PATH
    this.pubsub = new PubSub({
      keyFilename: keyFilePath,
      projectId: process.env.PROJECT_ID,
    })
    this.topicName = process.env.PUBSUB_TOPIC_NAME
  }

  /**
   * OCR処理リクエストメッセージを発行
   * @param {string} documentId - ドキュメントID
   */
  async publishOCRRequest(documentId) {
    const topic = this.pubsub.topic(this.topicName)
    const messageObject = {
      documentId,
    }
    const dataBuffer = Buffer.from(JSON.stringify(messageObject))

    try {
      const messageId = await topic.publishMessage({ data: dataBuffer })
      console.log(`Message ${messageId} published for document ${documentId}`)
      return messageId
    } catch (error) {
      console.error(
        `Error publishing message for document ${documentId}:`,
        error
      )
      throw error
    }
  }

  /**
   * 複数のOCR処理リクエストを一括発行
   */
  async publishBulkOCRRequests(documentIds) {
    const promises = documentIds.map((id) => this.publishOCRRequest(id))
    return Promise.all(promises)
  }
}

module.exports = new PubSubPublisher()
