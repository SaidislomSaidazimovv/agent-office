// ── Host (extension) matnlari — 8 til ───────────────────────
// Toast bildirishnomalar, status bar va rozilik so'rovi avval faqat o'zbekcha
// edi, holbuki UI standart tili ingliz. Endi ular panelda tanlangan tilga
// ergashadi (webview `setLang` yuboradi); panel hali ochilmagan bo'lsa — VS Code
// interfeysi tili. DOM/vscode'siz sof modul — test qilinadi.

export const HOST_LANGS = ["uz", "ru", "en", "tr", "ja", "zh", "ko", "fr"] as const;
export type HostLang = (typeof HOST_LANGS)[number];

const dict = {
  "notify.permission": { uz: "ruxsat so'radi 🔔", ru: "запрашивает разрешение 🔔", en: "needs permission 🔔", tr: "izin istiyor 🔔", ja: "許可を求めています 🔔", zh: "请求权限 🔔", ko: "권한을 요청합니다 🔔", fr: "demande une autorisation 🔔" },
  "notify.blocked": { uz: "bloklandi (xato) ⛔", ru: "заблокирован (ошибка) ⛔", en: "blocked (error) ⛔", tr: "engellendi (hata) ⛔", ja: "ブロック中（エラー） ⛔", zh: "被阻塞（错误） ⛔", ko: "차단됨 (오류) ⛔", fr: "bloqué (erreur) ⛔" },
  "notify.stuck": { uz: "{min} daqiqadan beri ruxsat kutmoqda 🙋", ru: "ждёт разрешения уже {min} мин 🙋", en: "has been waiting for permission for {min} min 🙋", tr: "{min} dakikadır izin bekliyor 🙋", ja: "{min} 分間許可を待っています 🙋", zh: "已等待权限 {min} 分钟 🙋", ko: "{min}분째 권한을 기다리는 중 🙋", fr: "attend une autorisation depuis {min} min 🙋" },
  "notify.show": { uz: "Ko'rsatish", ru: "Показать", en: "Show", tr: "Göster", ja: "表示", zh: "显示", ko: "보기", fr: "Afficher" },
  "budget.over": { uz: "💸 Byudjetdan oshdi: ~{spent} / {limit} (faqat ogohlantirish)", ru: "💸 Бюджет превышен: ~{spent} / {limit} (только предупреждение)", en: "💸 Over budget: ~{spent} / {limit} (warning only)", tr: "💸 Bütçe aşıldı: ~{spent} / {limit} (yalnızca uyarı)", ja: "💸 予算超過: ~{spent} / {limit}（警告のみ）", zh: "💸 超出预算：~{spent} / {limit}（仅提醒）", ko: "💸 예산 초과: ~{spent} / {limit} (경고만)", fr: "💸 Budget dépassé : ~{spent} / {limit} (avertissement seulement)" },
  "budget.open": { uz: "Panelni ochish", ru: "Открыть панель", en: "Open panel", tr: "Paneli aç", ja: "パネルを開く", zh: "打开面板", ko: "패널 열기", fr: "Ouvrir le panneau" },
  "hooks.ask": {
    uz: "Agent Office: tezroq va ishonchliroq jonli aniqlash uchun ~/.claude/settings.json'ga hook qo'shilsinmi? Ularsiz ham ofis transkriptlar orqali ishlaydi. Istalgan payt olib tashlash mumkin (buyruq: Agent Office: Uninstall Claude Hooks).",
    ru: "Agent Office: добавить хуки в ~/.claude/settings.json для более быстрого и надёжного отслеживания? Без них офис работает по транскриптам. Удалить можно в любой момент (команда: Agent Office: Uninstall Claude Hooks).",
    en: "Agent Office: add hooks to ~/.claude/settings.json for faster, more reliable live detection? Without them the office still works from transcripts. You can remove them any time (command: Agent Office: Uninstall Claude Hooks).",
    tr: "Agent Office: daha hızlı ve güvenilir canlı algılama için ~/.claude/settings.json dosyasına hook eklensin mi? Onlar olmadan da ofis transkriptlerden çalışır. İstediğiniz zaman kaldırabilirsiniz (komut: Agent Office: Uninstall Claude Hooks).",
    ja: "Agent Office: より速く確実なライブ検出のために ~/.claude/settings.json にフックを追加しますか？なくてもトランスクリプトから動作します。いつでも削除できます（コマンド: Agent Office: Uninstall Claude Hooks）。",
    zh: "Agent Office：是否向 ~/.claude/settings.json 添加钩子，以实现更快、更可靠的实时检测？没有它们，办公室仍可通过转录运行。可随时移除（命令：Agent Office: Uninstall Claude Hooks）。",
    ko: "Agent Office: 더 빠르고 안정적인 실시간 감지를 위해 ~/.claude/settings.json에 훅을 추가할까요? 없어도 트랜스크립트로 동작합니다. 언제든 제거할 수 있습니다(명령: Agent Office: Uninstall Claude Hooks).",
    fr: "Agent Office : ajouter des hooks à ~/.claude/settings.json pour une détection en direct plus rapide et plus fiable ? Sans eux, le bureau fonctionne quand même à partir des transcriptions. Vous pouvez les retirer à tout moment (commande : Agent Office: Uninstall Claude Hooks).",
  },
  "hooks.allow": { uz: "Ruxsat berish", ru: "Разрешить", en: "Allow", tr: "İzin ver", ja: "許可", zh: "允许", ko: "허용", fr: "Autoriser" },
  "hooks.notNow": { uz: "Hozir emas", ru: "Не сейчас", en: "Not now", tr: "Şimdi değil", ja: "今はしない", zh: "暂不", ko: "나중에", fr: "Pas maintenant" },
  "hooks.installed": { uz: "Agent Office: Claude hook'lari o'rnatildi.", ru: "Agent Office: хуки Claude установлены.", en: "Agent Office: Claude hooks installed.", tr: "Agent Office: Claude hook'ları kuruldu.", ja: "Agent Office: Claude フックをインストールしました。", zh: "Agent Office：已安装 Claude 钩子。", ko: "Agent Office: Claude 훅을 설치했습니다.", fr: "Agent Office : hooks Claude installés." },
  "hooks.installFailed": { uz: "Agent Office: hook o'rnatib bo'lmadi (~/.claude/settings.json o'qilmadi — o'zgartirilmadi).", ru: "Agent Office: не удалось установить хуки (~/.claude/settings.json не прочитан — не изменён).", en: "Agent Office: could not install hooks (~/.claude/settings.json could not be read — left unchanged).", tr: "Agent Office: hook'lar kurulamadı (~/.claude/settings.json okunamadı — değiştirilmedi).", ja: "Agent Office: フックをインストールできませんでした（~/.claude/settings.json を読めず、変更していません）。", zh: "Agent Office：无法安装钩子（无法读取 ~/.claude/settings.json——未作修改）。", ko: "Agent Office: 훅을 설치하지 못했습니다(~/.claude/settings.json을 읽지 못해 변경하지 않음).", fr: "Agent Office : impossible d'installer les hooks (~/.claude/settings.json illisible — laissé tel quel)." },
  "hooks.removed": { uz: "Agent Office: Claude hook'lari olib tashlandi. Siz o'zingiz o'rnatmaguningizcha qayta qo'shilmaydi.", ru: "Agent Office: хуки Claude удалены. Они не будут добавлены снова, пока вы сами их не установите.", en: "Agent Office: Claude hooks removed. They won't be added again unless you install them.", tr: "Agent Office: Claude hook'ları kaldırıldı. Siz kurmadıkça tekrar eklenmeyecek.", ja: "Agent Office: Claude フックを削除しました。ご自身でインストールするまで再追加されません。", zh: "Agent Office：已移除 Claude 钩子。除非你重新安装，否则不会再次添加。", ko: "Agent Office: Claude 훅을 제거했습니다. 직접 설치하기 전에는 다시 추가되지 않습니다.", fr: "Agent Office : hooks Claude retirés. Ils ne seront pas rajoutés sauf si vous les installez." },
  "sb.blocked": { uz: "⛔ bloklangan", ru: "⛔ заблокирован", en: "⛔ blocked", tr: "⛔ engellendi", ja: "⛔ ブロック中", zh: "⛔ 被阻塞", ko: "⛔ 차단됨", fr: "⛔ bloqué" },
  "sb.stuck": { uz: "🙋 uzoq kutmoqda", ru: "🙋 давно ждёт", en: "🙋 waiting a long time", tr: "🙋 uzun süredir bekliyor", ja: "🙋 長く待っています", zh: "🙋 已等待很久", ko: "🙋 오래 기다리는 중", fr: "🙋 attend depuis longtemps" },
  "sb.waiting": { uz: "🔔 ruxsat kutmoqda", ru: "🔔 ждёт разрешения", en: "🔔 waiting for permission", tr: "🔔 izin bekliyor", ja: "🔔 許可待ち", zh: "🔔 等待权限", ko: "🔔 권한 대기 중", fr: "🔔 attend une autorisation" },
  "sb.working": { uz: "🟢 ishlamoqda", ru: "🟢 работает", en: "🟢 working", tr: "🟢 çalışıyor", ja: "🟢 作業中", zh: "🟢 工作中", ko: "🟢 작업 중", fr: "🟢 au travail" },
  "sb.click": { uz: "Ofisni ochish uchun bosing", ru: "Нажмите, чтобы открыть офис", en: "Click to open the office", tr: "Ofisi açmak için tıklayın", ja: "クリックしてオフィスを開く", zh: "点击打开办公室", ko: "클릭하여 사무실 열기", fr: "Cliquez pour ouvrir le bureau" },
  "webview.notBuilt": { uz: "Webview qurilmagan. <code>npm run build</code> ni ishga tushiring.", ru: "Webview не собран. Запустите <code>npm run build</code>.", en: "The webview is not built. Run <code>npm run build</code>.", tr: "Webview derlenmemiş. <code>npm run build</code> çalıştırın.", ja: "Webview がビルドされていません。<code>npm run build</code> を実行してください。", zh: "Webview 尚未构建。请运行 <code>npm run build</code>。", ko: "Webview가 빌드되지 않았습니다. <code>npm run build</code>를 실행하세요.", fr: "Le webview n'est pas construit. Lancez <code>npm run build</code>." },
} satisfies Record<string, Record<HostLang, string>>;

export type HostKey = keyof typeof dict;

export function isHostLang(v: unknown): v is HostLang {
  return typeof v === "string" && (HOST_LANGS as readonly string[]).includes(v);
}

/** VS Code interfeysi tilidan (vscode.env.language: "ru", "zh-cn", "en-us"…). */
export function langFromLocale(locale: string | undefined): HostLang {
  const l = (locale ?? "").toLowerCase();
  const base = l.split("-")[0];
  return isHostLang(base) ? base : "en";
}

/** Tarjima + `{x}` o'rniga qiymat. Topilmasa — ingliz. */
export function ht(lang: HostLang, key: HostKey, vars?: Record<string, string | number>): string {
  const s: string = dict[key][lang] ?? dict[key].en;
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`)) : s;
}
