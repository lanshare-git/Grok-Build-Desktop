import type { welcome as zh } from '../zh-cn/welcome'

export const welcome: typeof zh = {
  title: 'Grok Build デスクトップ',
  lead: 'ターミナル版 Grok Build のログイン状態、モデル、ツールチェーンをそのまま再利用し、ACP プロトコルで同じ Agent を駆動します。',
  point1: 'ストリーミング出力、思考プロセス、ツール呼び出し、実行計画をすべて可視化',
  point2: 'ファイルの読み書き、コマンド実行、コード検索など、ターミナル版と同等の機能',
  point3: 'セッションは保存・再開でき、履歴はターミナル版と共有されます',
  connFailed: '接続に失敗しました：',
  unknownError: '不明なエラー',
  viewDiagnostics: 'セルフチェックの詳細を見る',
  diagIssues: (vars: { n: number }) => `セルフチェックで ${vars.n} 件の異常が見つかりました：`,
  listSeparator: '、',
  viewDetails: '詳細を見る',
  newTask: '新しいタスク',
  chatTitle:
    'ホームディレクトリをルートとし、どのプロジェクトにも紐付けず、読み取り専用（ファイル書き込みなし）で気軽に会話を始めます',
  foot: 'プロジェクトに紐付けたくない場合は、「新しいチャット」をクリックするだけで開始できます。セッションはホームディレクトリをルートとし、読み取り専用（ファイル書き込みなし）に固定されます。プロジェクトに紐付けられたタスクは選択した作業ディレクトリをルートとし、作成後は変更できません。'
}
