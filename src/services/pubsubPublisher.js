/**
 * Pub/Sub Publisher サービス
 */
const { PubSub } = require('@google-cloud/pubsub')

class PubSubPublisher {
  constructor() {
    const keyFilePath = process.env.KEY_FILE_PATH
    const projectId = process.env.PROJECT_ID

    console.log('=== Pub/Sub Configuration ===')
    console.log(`Project ID: ${projectId}`)
    console.log(`Topic Name: ${process.env.PUBSUB_TOPIC_NAME}`)
    console.log(`Key File Path: ${keyFilePath}`)

    this.pubsub = new PubSub({
      keyFilename: keyFilePath,
      projectId: projectId,
    })
    this.topicName = process.env.PUBSUB_TOPIC_NAME
    this.projectId = projectId
    this.topic = null
  }

  /**
   * トピックの初期化と存在確認
   */
  async initializeTopic() {
    if (this.topic) {
      return this.topic
    }

    const fullTopicName = `projects/${this.projectId}/topics/${this.topicName}`
    console.log(`\n=== Initializing Pub/Sub Topic ===`)
    console.log(`Full topic name: ${fullTopicName}`)

    const topic = this.pubsub.topic(this.topicName)

    try {
      // トピックのメタデータを取得して存在と権限を確認
      console.log(`Attempting to get metadata for: ${this.topicName}`)
      const [metadata] = await topic.getMetadata()
      console.log(`✓ Topic verified successfully`)
      console.log(`  Topic name: ${metadata.name}`)

      // IAMポリシーも確認
      try {
        const [policy] = await topic.iam.getPolicy()
        console.log(`  IAM bindings count: ${policy.bindings?.length || 0}`)
      } catch (iamError) {
        console.log(`  Could not retrieve IAM policy (may not have permission)`)
      }

      this.topic = topic
      return this.topic
    } catch (error) {
      console.error('\n✗ Error occurred:')
      console.error(`  Error code: ${error.code}`)
      console.error(`  Error message: ${error.message}`)
      console.error(`  Error details: ${error.details}`)

      if (error.code === 5) {
        console.error(`\nTroubleshooting steps:`)
        console.error(`1. Verify topic exists in GCP Console:`)
        console.error(
          `   https://console.cloud.google.com/cloudpubsub/topic/list?project=${this.projectId}`
        )
        console.error(`2. Check if service account has Pub/Sub Publisher role`)
        console.error(`3. Verify Pub/Sub API is enabled in project`)
      } else if (error.code === 7) {
        console.error(`\nPermission denied. Check service account permissions.`)
      }

      throw error
    }
  }

  /**
   * OCR処理リクエストメッセージを発行
   * @param {string} documentId - ドキュメントID
   */
  async publishOCRRequest(documentId) {
    try {
      const topic = await this.initializeTopic()

      const messageObject = {
        documentId,
      }
      const dataBuffer = Buffer.from(JSON.stringify(messageObject))

      console.log(`Publishing message for document: ${documentId}`)

      // publish() メソッドを使用（publishMessage()の代わり）
      const messageId = await topic.publish(dataBuffer)
      console.log(`✓ Message ${messageId} published for document ${documentId}`)
      return messageId
    } catch (error) {
      console.error(`✗ Error publishing message for document ${documentId}:`)
      console.error(`  Error code: ${error.code}`)
      console.error(`  Error message: ${error.message}`)

      if (error.code === 7) {
        console.error(`\nDebugging info:`)
        console.error(`  - Service account: Check key file client_email`)
        console.error(`  - Topic permissions: Verify in Pub/Sub Console`)
        console.error(
          `  - Try: gcloud pubsub topics get-iam-policy ${this.topicName} --project=${this.projectId}`
        )
      }

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
