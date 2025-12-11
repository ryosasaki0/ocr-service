/**
 * PDF分割ユーティリティ
 */
const { PDFDocument } = require('pdf-lib')

class PdfSplitter {
  /**
   * PDFのページ数を取得
   */
  async getPageCount(pdfBuffer) {
    const pdfDoc = await PDFDocument.load(pdfBuffer)
    return pdfDoc.getPageCount()
  }

  /**
   * PDFを1ページずつ分割
   * @param {Buffer} pdfBuffer - 元のPDFバッファ
   * @returns {Promise<Buffer[]>} - 分割されたPDFバッファの配列
   */
  async splitPdf(pdfBuffer) {
    const pdfDoc = await PDFDocument.load(pdfBuffer)
    const pageCount = pdfDoc.getPageCount()
    const splitPages = []

    for (let i = 0; i < pageCount; i++) {
      // 新しいPDFドキュメントを作成
      const newPdfDoc = await PDFDocument.create()

      // i番目のページをコピー
      const [copiedPage] = await newPdfDoc.copyPages(pdfDoc, [i])
      newPdfDoc.addPage(copiedPage)

      // PDFをバッファとして保存
      const pdfBytes = await newPdfDoc.save()
      splitPages.push(Buffer.from(pdfBytes))
    }

    return splitPages
  }
}

module.exports = new PdfSplitter()
