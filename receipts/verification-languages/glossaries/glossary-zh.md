# Farseek glossary: Simplified Chinese (zh)

The terms below hold everywhere in `game/i18n/zh.js`. Translations live in `outputs/i18n/work-zh/zh.json`; `node outputs/i18n/work-zh/build.mjs` rebuilds and formats the module and flags typography slips.

## Register and typography

- The game speaks to the player as 你. Mira writes to Nyra as 你. The clerk and the Processed screen use the bureaucratic 您 (祝您度过美好的永恒, 您的案件已结案).
- Full-width punctuation: ，。：；？！“”（）; ellipsis ……; quoted notes and signs inside prose take “”. No dashes.
- No spaces between Han characters, Latin words or placeholders (按{key}跳跃, Esc返回). The HUD separator stays ` · `.
- X of Y counts read `{found}/{total}`; Level {n} reads 第{n}关; seconds read {n}秒.
- Journal dates use Chinese numerals: 第九天, 第二十七天. A bold date before an HTML space (`<b>Day 9.</b>`) drops its period: 第九天.
- Mira's signature stays M.; Farseek stays in Latin letters.
- A control name inserted into a sentence takes quotes: “{action}”现在使用{key}。 An inserted bay title takes quotes too: 前往“{bay}”.

## Names

| English | Chinese |
| --- | --- |
| Nyra / Nyra Varen | 奈拉 / 奈拉·瓦伦 |
| Mira | 米拉 |
| Oldtusk | 老獠牙 |
| the builders | 建造者 |
| the Wardens / Warden | 看守 |
| Warden Crescent, Wave, Disc | 新月看守、波浪看守、圆盘看守 |
| the clerk | 办事员 |
| the keeper | 看管者 |
| Tide Guardian / the guardian | 潮汐守护者 / 守护者 |
| the (first, previous) expedition | (第一支、前一支)探险队 |
| boars / frost lynx | 野猪 / 霜猞猁 |

## Worlds and places

| English | Chinese |
| --- | --- |
| The Sunken Court | 沉陷之庭 (the court: 庭院) |
| The Checkpoint | 检查站 |
| The Dawn Isles | 黎明群岛 |
| The Frozen Reach | 冰封之境 |
| The Wildwood | 莽林 |
| The Drowned Archive | 沉没档案馆 (the drowned city: 沉没之城) |
| The Builders' Vault | 建造者秘库 (the vault: 秘库; a bay: 侧厅) |
| terrace / court floor | 露台 / 庭院底部 |
| floating isles / drifting (wandering) isle, ferry | 浮空群岛 / 漂流岛 |

## The gate network

| English | Chinese |
| --- | --- |
| door / far door | 门 / 远方之门 |
| gate | 传送门 |
| ring / great ring | 环门 (圆环 before it is known as a door) / 巨环 |
| network | 网络 |
| address / glyph | 地址 / 符文 |
| disc, crescent, waves, spiral, star | 圆盘、新月、波浪、螺旋、星 |
| stela, stelae | 石碑 |
| bronze mirror | 铜镜 |
| crystal / lens / prism | 水晶 / 透镜 / 棱镜 |
| pylon / bridge of light | 光塔 / 光桥 (bay title: 光之桥) |
| seal / medallion | 封印 / 圆章 |
| channel (of light) | 光槽 |
| stone memory | 石之记忆 |

## Equipment and mechanics

| English | Chinese |
| --- | --- |
| relay orb / orb | 传光宝珠 / 宝珠 |
| link (verb, touch button) | 连接 |
| charge, charged | 充能, 已充能 |
| pulse (noun) / pulse X (verb) | 脉冲 / 向X发出脉冲 |
| relay pull, tether | 传光牵引, 牵引 |
| relay shield, ward | 传光护盾, 屏障 |
| relay (light), relayed light | 传递光线, 传递之光 |
| twin pistols / pistols | 双枪 / 手枪 |
| aim / fire, shoot / reload | 瞄准 / 射击, 开枪 / 换弹 |
| magazine / rounds | 弹匣 / 发(子弹) |
| pistol craft | 手枪技巧 |
| expedition kit, equipment, Kit | 探险装备, 装备 |
| field kit | 野外装备 |
| equipment wheel | 装备轮盘 |
| health pips / composure | 生命格 / 镇定 |
| breath (HUD) | 氧气 |
| relic | 遗物 |
| stamp (noun / verb) / clean stamp | 印章 / 盖章 / 合格印章 |
| plate (checkpoint, vault ice) | 石板 |
| amber plate (pistol targets) | 琥珀色靶板 |
| small register | 小登记台 |
| transit file / ledger / copy | 过境档案 / 登记簿 / 抄本 |
| confiscation bin / barrier lamp | 没收箱 / 栏杆的信号灯 |
| stamp review / ferry survey / cairn trail | 印章审核 / 漂流岛测量 / 石标路线 |
| cairn / floe / ice sheet / thin ice | 石标 / 浮冰 / 冰面 / 薄冰 |
| frozen fall / scarred ice / ice axes | 冰瀑 / 有凿痕的冰 / 冰镐 |
| spore pod / spore water / spore bog | 孢子荚 / 孢子水 / 孢子沼泽 |
| (thick) ivy / grove / bastion | (粗壮)常春藤 / 林地 / 棱堡 |
| control desk / air shield / causeway | 控制台 / 空气护盾 / 堤道 |
| vent (sea floor) / cyan vent (guardian) | 喷口 / 青色泄压阀 |
| current / pier / landing | 水流 / 桥墩 / 平台 |
| trail refuge / trail lantern | 路旁庇护所 / 路旁提灯 |

## Verbs and controls

| English | Chinese |
| --- | --- |
| jump / leap | 跳跃 / 跃起 |
| hang / shimmy / climb / let go | 悬挂 / 横移 / 攀爬 / 松手 |
| grab, use | 抓取, 使用 |
| swing / rope swing | 荡 / 荡绳 |
| roll / dodge, sidestep | 翻滚 / 闪避, 侧身闪开 |
| walk / run / pace | 步行 / 奔跑 / 步速 |
| careful walk | 谨慎步行 |
| dive / rise | 下潜 / 上浮 |
| Act (control) | 行动 |
| Look / stick | 视角 / 摇杆 |
| press X / tap X | 按X / 点按X |
| X hold (touch) | 长按X |

## Key labels

Mainland keyboards print English labels, so Enter, Esc, Shift, Ctrl, Alt, Tab, Backspace and Caps Lock stay as printed; Space reads 空格. Mouse: 左键 (short), 鼠标左键 (long), 鼠标中键, 鼠标右键, 鼠标4, 鼠标5. Numpad: 小键盘{key}. Sided modifiers: 左{key}, 右{key}. Gamepad: 视图, 开始 (开始键 in prose), 十字键上/下/左/右, 主页, 左摇杆, 右摇杆, 按钮{n}.

## Settings vocabulary

Difficulty 难度: 剧情, 标准, 困难. Image quality 画质: 高, 均衡, 流畅. Subtitle backing 字幕背景: 无, 半透明, 不透明. Aim 瞄准: 按住, 切换. Language 语言: 自动.
