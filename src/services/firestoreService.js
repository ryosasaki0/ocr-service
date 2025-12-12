/**
 * Firestore サービス
 */
const { Firestore, FieldValue } = require('@google-cloud/firestore')

class FirestoreService {
  constructor() {
    const keyFilePath = process.env.KEY_FILE_PATH
    const projectId = process.env.PROJECT_ID
    const databaseId = process.env.FIRESTORE_DATABASE_ID || 'ocr-service'

    console.log('\n=== Firestore Configuration ===')
    console.log(`Project ID: ${projectId}`)
    console.log(`Key File Path: ${keyFilePath}`)
    console.log(`Database ID: ${databaseId}`)

    try {
      this.db = new Firestore({
        keyFilename: keyFilePath,
        projectId: projectId,
        databaseId: databaseId,
      })
      console.log('✓ Firestore client initialized')
    } catch (error) {
      console.error('✗ Failed to initialize Firestore client:', error)
      throw error
    }

    this.batchesCollection = this.db.collection('batches')
    this.documentsCollection = this.db.collection('documents')
  }

  /**
   * バッチを作成
   */
  async createBatch(batchData) {
    console.log(`\n=== Creating Batch ===`)
    console.log(`Batch ID: ${batchData.batchId}`)

    try {
      const docRef = this.batchesCollection.doc(batchData.batchId)
      console.log(`Document reference: ${docRef.path}`)

      const data = {
        ...batchData,
        createdAt: FieldValue.serverTimestamp(),
      }
      console.log(`Writing batch data with ${Object.keys(data).length} fields`)

      await docRef.set(data)
      console.log('✓ Batch created successfully')
      return batchData.batchId
    } catch (error) {
      console.error('✗ Error creating batch:')
      console.error(`  Error code: ${error.code}`)
      console.error(`  Error message: ${error.message}`)
      console.error(`  Error details: ${error.details}`)

      if (error.code === 5) {
        console.error('\nPossible causes:')
        console.error('1. Firestore database does not exist in project')
        console.error(
          '2. Database is in wrong mode (Datastore instead of Native)'
        )
        console.error('3. Service account lacks Firestore permissions')
        console.error(
          `\nCheck database at: https://console.cloud.google.com/firestore/databases?project=${process.env.PROJECT_ID}`
        )
      }
      throw error
    }
  }

  /**
   * 複数のドキュメントを一括作成
   */
  async createDocuments(documents) {
    console.log(`\n=== Creating Documents ===`)
    console.log(`Number of documents: ${documents.length}`)

    try {
      const batch = this.db.batch()

      documents.forEach((doc, index) => {
        const docRef = this.documentsCollection.doc(doc.documentId)
        if (index === 0) {
          console.log(`First document reference: ${docRef.path}`)
        }
        batch.set(docRef, {
          ...doc,
          status: 'pending',
          createdAt: FieldValue.serverTimestamp(),
        })
      })

      console.log('Committing batch write...')
      await batch.commit()
      console.log('✓ Documents created successfully')
    } catch (error) {
      console.error('✗ Error creating documents:')
      console.error(`  Error code: ${error.code}`)
      console.error(`  Error message: ${error.message}`)
      console.error(`  Error details: ${error.details}`)
      throw error
    }
  }

  /**
   * ドキュメントを取得
   */
  async getDocument(documentId) {
    const docRef = this.documentsCollection.doc(documentId)
    const doc = await docRef.get()

    if (!doc.exists) {
      throw new Error(`Document ${documentId} not found`)
    }

    return { id: doc.id, ...doc.data() }
  }

  /**
   * ドキュメントのステータスを更新
   */
  async updateDocumentStatus(documentId, status, additionalData = {}) {
    const docRef = this.documentsCollection.doc(documentId)
    await docRef.update({
      status,
      ...additionalData,
      ...(status === 'completed' && {
        processedAt: FieldValue.serverTimestamp(),
      }),
      ...(status === 'failed' && { errorAt: FieldValue.serverTimestamp() }),
    })
  }

  /**
   * バッチの処理済みドキュメント数をインクリメント
   */
  async incrementBatchProcessed(batchId) {
    const batchRef = this.batchesCollection.doc(batchId)
    await batchRef.update({
      processedDocuments: FieldValue.increment(1),
    })
  }

  /**
   * バッチの失敗ドキュメント数をインクリメント
   */
  async incrementBatchFailed(batchId) {
    const batchRef = this.batchesCollection.doc(batchId)
    await batchRef.update({
      failedDocuments: FieldValue.increment(1),
    })
  }

  /**
   * バッチ情報を取得
   */
  async getBatch(batchId) {
    const batchRef = this.batchesCollection.doc(batchId)
    const doc = await batchRef.get()

    if (!doc.exists) {
      throw new Error(`Batch ${batchId} not found`)
    }

    return { id: doc.id, ...doc.data() }
  }

  /**
   * バッチを完了状態に更新
   */
  async completeBatch(batchId) {
    const batchRef = this.batchesCollection.doc(batchId)
    await batchRef.update({
      status: 'completed',
      completedAt: FieldValue.serverTimestamp(),
    })
  }
}

module.exports = new FirestoreService()
