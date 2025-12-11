/**
 * Firestore サービス
 */
const { Firestore, FieldValue } = require('@google-cloud/firestore')

class FirestoreService {
  constructor() {
    const keyFilePath = process.env.KEY_FILE_PATH
    this.db = new Firestore({
      keyFilename: keyFilePath,
      projectId: process.env.PROJECT_ID,
    })
    this.batchesCollection = this.db.collection('batches')
    this.documentsCollection = this.db.collection('documents')
  }

  /**
   * バッチを作成
   */
  async createBatch(batchData) {
    const docRef = this.batchesCollection.doc(batchData.batchId)
    await docRef.set({
      ...batchData,
      createdAt: FieldValue.serverTimestamp(),
    })
    return batchData.batchId
  }

  /**
   * 複数のドキュメントを一括作成
   */
  async createDocuments(documents) {
    const batch = this.db.batch()

    documents.forEach((doc) => {
      const docRef = this.documentsCollection.doc(doc.documentId)
      batch.set(docRef, {
        ...doc,
        status: 'pending',
        createdAt: FieldValue.serverTimestamp(),
      })
    })

    await batch.commit()
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
