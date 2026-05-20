const HIDDEN_STATE = {
  visible: false,
  mode: "hidden",
  statusLabel: "",
  message: "",
  signals: [],
};

export function buildSignalPanelState({ enabled, data, error } = {}) {
  if (!enabled) return HIDDEN_STATE;

  if (error || data?.error) {
    return {
      visible: true,
      mode: "error",
      statusLabel: "取得制限中",
      message: "乐天ランキングAPIの制限で一時的に取得できません",
      signals: [],
    };
  }

  if (!data) {
    return {
      visible: true,
      mode: "loading",
      statusLabel: "確認中",
      message: "实时榜を確認中",
      signals: [],
    };
  }

  if (data.warmingUp) {
    return {
      visible: true,
      mode: "warmup",
      statusLabel: "基線作成中",
      message: "現在の榜单を基準として記録中",
      signals: [],
    };
  }

  const signals = data.signals || [];
  const realtimeTop = data.config?.realtimeTop || 50;

  if (signals.length === 0) {
    return {
      visible: true,
      mode: "empty",
      statusLabel: "監視中",
      message: `实时前${realtimeTop}を監視中`,
      signals: [],
    };
  }

  return {
    visible: true,
    mode: "signals",
    statusLabel: `${signals.length}件`,
    message: `实时前${realtimeTop}から検出`,
    signals,
  };
}
