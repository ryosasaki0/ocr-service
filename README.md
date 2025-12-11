# ocr-service

Google Cloud Document AI を使用した OCR サービス

## 前提条件

- Node.js 22 (LTS)
- Google Cloud プロジェクト
- Document AI API が有効化されていること
- サービスアカウントと認証キー(JSON)

## セットアップ

### 1. Node.js 22 のインストール

nvm を使用している場合:

```bash
nvm install 22
nvm use 22
```

### 2. 依存関係のインストール

```bash
npm install
```

### 3. 環境変数の設定

`.env.example` を `.env` にコピーして設定:

```bash
cp .env.example .env
```

`.env` ファイルを編集して、以下の項目を設定してください:

```bash
# 認証情報 (いずれかを設定)
KEY_FILE_PATH=./path/to/service-account-key.json
# または
# GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json

# Document AI 設定 (必須)
PROJECT_ID=your-gcp-project-id
PROCESSOR_ID=your-processor-id

# オプション設定
LOCATION=us
FILE_PATH=./your-image.jpg
```

#### 設定項目の説明

| 環境変数                         | 必須 | デフォルト値   | 説明                                                  |
| -------------------------------- | ---- | -------------- | ----------------------------------------------------- |
| `KEY_FILE_PATH`                  | ○※   | -              | サービスアカウントキー(JSON)のパス                    |
| `GOOGLE_APPLICATION_CREDENTIALS` | ○※   | -              | サービスアカウントキー(JSON)のパス (代替)             |
| `PROJECT_ID`                     | ○    | -              | GCP プロジェクト ID                                   |
| `PROCESSOR_ID`                   | ○    | -              | Document AI プロセッサ ID                             |
| `LOCATION`                       | -    | `us`           | プロセッサの場所 (`us`, `eu`, `asia-northeast1` など) |
| `FILE_PATH`                      | -    | `./sample.jpg` | 解析する画像ファイルのパス                            |

※ `KEY_FILE_PATH` または `GOOGLE_APPLICATION_CREDENTIALS` のいずれか一つが必須です。

## 使い方

### 基本的な実行方法

環境変数を設定した状態で実行:

```bash
npm start
```

または

```bash
node main.js
```

### 実行例

#### 例 1: .env ファイルを使用

`.env` ファイルに設定を記述:

```bash
KEY_FILE_PATH=./keys/service-account.json
PROJECT_ID=my-project-123
PROCESSOR_ID=abc123def456
FILE_PATH=./documents/invoice.pdf
```

実行:

```bash
npm start
```

#### 例 2: 環境変数を直接指定

```bash
KEY_FILE_PATH=./keys/key.json \
PROJECT_ID=my-project-123 \
PROCESSOR_ID=abc123def456 \
FILE_PATH=./image.jpg \
node main.js
```

### 対応ファイル形式

スクリプトは以下の形式を自動判定します:

- **JPEG** (`.jpg`, `.jpeg`)
- **PNG** (`.png`)
- **PDF** (`.pdf`)

## トラブルシューティング

### 認証エラーが発生する場合

**エラーメッセージ: "認証情報が設定されていません"**

- `.env` ファイルが存在するか確認
- `.env` ファイルで `KEY_FILE_PATH` または `GOOGLE_APPLICATION_CREDENTIALS` が設定されているか確認
- サービスアカウントキーファイルが指定したパスに存在するか確認
- サービスアカウントに Document AI の権限 (`roles/documentai.apiUser`) があるか確認

### 設定エラーが発生する場合

**エラーメッセージ: "PROJECT_ID と PROCESSOR_ID を設定してください"**

- `.env` ファイルで `PROJECT_ID` と `PROCESSOR_ID` が正しく設定されているか確認
- 環境変数に余分なスペースや引用符が含まれていないか確認

### API エラーが発生する場合

- `PROJECT_ID` が正しいか確認
- Document AI API が有効化されているか確認 ([GCP コンソール](https://console.cloud.google.com/apis/library/documentai.googleapis.com))
- `PROCESSOR_ID` が正しいか確認 ([Document AI コンソール](https://console.cloud.google.com/ai/document-ai/processors))
- `LOCATION` がプロセッサを作成した場所と一致しているか確認

### ファイル読み込みエラーが発生する場合

- `FILE_PATH` で指定したファイルが存在するか確認
- ファイルパスが正しいか確認 (相対パスまたは絶対パス)
- ファイルの読み取り権限があるか確認
