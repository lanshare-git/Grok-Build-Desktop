import type { density as zh } from '../zh-cn/density'

export const density: typeof zh = {
  detailed: {
    label: '詳細',
    desc: 'ツールカードを既定で展開し、入力と出力を表示'
  },
  'compact-shells': {
    label: 'コマンド出力を折りたたむ',
    desc: '既定で折りたたみ。ターミナル/コマンド系カードは引数サマリーも非表示'
  },
  'compact-ungrouped': {
    label: 'コンパクト（グループなし）',
    desc: '既定で折りたたみ。各ツール呼び出しが1行ずつ（grok の既定）'
  },
  'compact-grouped': {
    label: 'コンパクト＋グループ',
    desc: '連続した同種ツール呼び出しを1枚の集約カードに統合'
  },
  'compact-all-grouped': {
    label: '最もコンパクト',
    desc: '同ツールを集約し、「思考過程」も既定で折りたたみ'
  }
}
