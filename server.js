const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = __dirname;
const styleLibraryDir = path.join(rootDir, "data", "style-library");
const styleLibraryImageDir = path.join(styleLibraryDir, "images");
const styleLibraryIndexPath = path.join(styleLibraryDir, "index.json");
loadEnv(path.join(rootDir, ".env"));
loadEnv(path.join(rootDir, ".env.local"), { override: true });

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT_OVERRIDE || process.env.PORT || 4173);
const chatEndpoint = "https://ark.cn-beijing.volces.com/api/v3/chat/completions";
const arkTimeoutMs = Number(process.env.ARK_TIMEOUT_MS || 180000);
const doubaoAnalysisModel =
  process.env.DOUBAO_ANALYSIS_MODEL ||
  process.env.DOUBAO_AGENT_MODEL ||
  "doubao-seed-2-1-pro-260628";
const doubaoAnalysisTimeoutMs = Number(process.env.DOUBAO_ANALYSIS_TIMEOUT_MS || 90000);

const imageTypes = [
  "模特正面",
  "模特侧身",
  "生活场景",
  "氛围场景",
  "商品细节",
  "种草封面",
];

const personTallModelVisualStandard =
  "人物图显高比例硬标准：所有人物图（第 1、2、3、4、6 张）必须统一呈现高挑修长的 167–170cm 职业模特视觉观感；这不是实际身高描述，只是出图视觉比例标准；通过可信偏修长头身比、自然连续长腿比例、偏高腰线、胯腰高度轻微低机位、50mm 自然透视、3:4 竖构图、全身或脚踝以上近全身、人物占画面高度约 86%-94% 共同控制显高感；头顶到脚踝/脚面必须形成完整纵向线条，膝盖到小腿不能被裁掉；不允许因为姿势、道具、栏杆、椅子、泳池边或构图导致压矮；若动作会显矮，必须改成站姿或长腿延展站姿；禁止头大、腿短、五五身、身材压缩、显矮、大腿中部截断、膝上截断、胸口以上大头构图、高机位俯拍、坐姿压缩、跪姿压缩、蹲姿、躺姿、过度拉伸、夸张小头超长腿和假人比例。";
const tallPoseHardLock =
  "修长姿态硬锁：所有人物图先保证整体人高挑修长再执行动作；优先站姿、微侧站姿、回头站姿、一腿前伸站姿或靠站，不使用坐、跪、蹲、躺、蜷腿、盘腿、低矮塌腰姿势；如果场景里有椅子、栏杆、泳池边、台阶或甲板，只能轻扶或靠站，不能坐下或跪下；双腿必须形成可读的长线条，腰线偏高，小腿/脚踝尽量入镜，不能只露大腿。";
const garmentClosureStructureLock =
  "开衫/闭合结构硬锁：这件商品按商品参考图的开衫/罩衫外搭处理，不是可扣合衬衫或针织上衣；人物正面图必须画成 unbuttoned open-front cardigan，前襟从领口到下摆保持连续敞开，左右两片前片分开并露出中间身体/内搭/空气间隙，下摆左右角也分开；严禁把左右前片在胸口、腰部或下摆处连接；严禁新增纽扣、扣眼、拉链、暗扣、搭扣、绑带、系结、蝴蝶结、扣条、门襟白色竖条、中心闭合竖线、单颗扣或一排扣；no button placket, no vertical button band, no central white strip, no tied knot, no fastened front, no closed V-neck blouse, no closed center seam.";

const productDetailLayoutStandard =
  "商品细节版式标准：3:4 竖版主次宫格，左侧大主宫格占画面约 65%-70% 并完整展示商品全貌，右侧窄竖列放 4 个小宫格展示局部卖点，左下角可补 1 个叠加式小细节块但不能遮挡主商品；白色 gutters/分隔线清楚，浅米色或浅奶油色台面/背景，自然软光、真实阴影和布料质感。";
const productDetailFullViewGuard =
  "完整全貌要求：主宫格内必须完整保留商品上缘/肩带、领口/前襟/开口、胸前或主体结构、腰部/中段、袖口/下摆/裙摆、闭合结构状态和参考图里的关键装饰，不能裁切、不能只放大局部、不能让任何商品边缘出画。";
const productDetailSmallCellsGuard =
  "小宫格内容：右侧竖列和左下角补图展示面料纹理、图案/印花/波点、领口/前襟/开口、真实闭合结构状态、结构褶皱、层叠/边缘、腰部或中段结构、装饰细节和做工，所有细节以商品参考图实际存在为准。";
const productDetailSmallCellsNoRepeatGuard =
  "小宫格去重与填充要求：右侧 4 个小宫格和左下角补图必须全部有真实商品内容，不能留白、不能空格、不能纯色块、不能虚化占位、不能重复裁切同一个局部；每个小宫格只展示一个不同卖点，至少覆盖面料纹理、图案/印花/波点、结构褶皱或层叠边缘、腰部/中段结构、装饰/做工中的 5 类不同细节；若某类细节在参考图中不存在，必须换成另一个真实存在且未使用过的商品细节，格内主体占该格约 75%-95%。";
const productDetailBan =
  "细节图禁用：无人物、无人脸、无身体、无手、无模特穿着展示、无人体模特、无新增纽扣/拉链/扣眼/绑带/闭合门襟/中心扣条/白色闭合竖线、无可读文字、无水印、无 Logo、无品牌标签、无随机商品；避免平均 2x3 宫格、死白底模板感、主图裁切和背景抢商品。";

const visualStandardLibrary = {
  modelStandard: {
    bodyRatio: personTallModelVisualStandard,
    bodyType: "real Japanese ecommerce model",
    height: "167–170cm 职业模特的视觉观感，不是实际身高描述",
    identity: [
      "Identity Lock",
      "Same Person",
      "Same Face",
      "Same Hair",
      "Same Makeup",
      "Same Skin Tone",
      "Same Height Visual Impression",
      "Same Body Ratio",
      "Same Photographer",
    ],
    legRatio: "natural continuous long-leg impression with believable human anatomy, high waistline, visible calves/ankles when possible, no short legs or over-stretched body",
    shoulder: "Natural shoulder",
    tallPoseHardLock,
    waistHip: "Natural waist and hip",
  },
  photographyStandard: {
    color: "统一清爽日系色温",
    composition: "commercial fashion photography, vertical full-body or ankle-up crop, believable hip-to-waist camera perspective, model fills 86%-94% frame height",
    lens: "50mm lens",
    lighting: "natural light, soft shadow, bounce light, matched exposure",
  },
  faceRealismStandard: {
    avoid: "no plastic skin, no doll face, no AI idol face, no over-bright eyes, no perfect symmetry, no beauty filter, no waxy skin, no anime look, no over-sharpened face",
    details: "visible pores, natural skin texture, tiny blemishes, subtle under-eye texture, natural nasolabial fold, real lip wrinkles, slight facial asymmetry, natural gaze",
    makeup: "natural Japanese commercial makeup, not heavy retouching, not influencer filter",
  },
  sceneRealismStandard: {
    avoid: "no CGI resort, no empty fake pool backdrop, no stock-photo background, no pasted subject, no cutout edge glow, no over-sharp subject, no repeated same pool/hotel scene",
    details: "real location details, correct perspective, same camera exposure, same color temperature, same depth of field, natural contact shadow, environmental reflections, slight background imperfections, lived-in props, atmospheric depth",
    diversity: "each image must use a clearly different location category, architecture, props, lighting time and camera distance",
  },
  referenceStyleLibrary: {
    mood: "真实淘宝/小红书泳衣搭配图，轻松度假、真实手机感、商业可售卖，不是 CGI 豪华酒店渲染",
    props: ["straw hat", "wide straw hat", "straw tote", "woven basket bag", "canvas tote", "coconut", "iced drink", "small drink bottle", "fruit cup", "champagne glass", "sunglasses", "shell necklace", "hair scarf", "flower hair clip", "visor cap", "baseball cap", "beach towel", "folded towel", "rattan sofa", "rattan tray", "white umbrella", "striped beach umbrella", "linen curtain", "sandals on ground"],
    scenes: ["clean studio window", "white wall showroom", "linen resort room window", "rattan sunroom corner", "minimal indoor mirror selfie", "beach town cafe terrace", "thatched beach bar", "fruit juice counter", "ice cream stand", "flower villa gate", "bougainvillea garden path", "palm shade garden walkway", "wooden pier marina", "harbor boardwalk", "yacht deck", "white sand beach umbrella", "beach shower tiled wall", "white changing room curtain", "pool garden with wet tiles only once", "white villa pool courtyard only once", "ocean rocks and skyline", "cliff ocean wooden railing"],
    poses: ["cover mouth with hand while standing", "adjust shoulder strap while standing", "hold coconut low while standing", "hold iced drink low while standing", "lean-standing on stone wall", "look back side profile standing", "eyes closed in sun standing", "walk under umbrella with long-leg line", "hand shading sun standing", "arms raised vacation pose standing", "touch hair with wind standing", "hold straw hat low while standing", "stand by pool edge with one leg forward", "natural squint standing"],
    textBan: "no readable text, no watermark, no logo, no random signage letters; use blurred generic signs only",
  },
  sceneLibrary: {
    studio: ["Clean Studio Window", "White Wall Showroom", "Linen Curtain", "Soft Side Light", "Catalog Clean Background"],
    indoor: ["Minimal Resort Room", "Rattan Sunroom", "Open Window", "Sheer Curtain", "Mirror Selfie", "Linen Bed Corner"],
    beachClub: ["Beach Club", "Infinity Pool", "Cabanas", "Wood Deck", "Rattan Chair", "Cocktail", "Striped Beach Umbrella", "Pool Towel", "Wet Tile Reflections"],
    lifestyle: ["Beach Town Cafe", "Beach Bar", "Outdoor Restaurant", "Fruit Juice Stand", "Ice Cream Stand", "Glass Balcony", "Rattan Sofa", "Iced Drink Condensation", "Wooden Bench", "Open Window", "Generic Vending Corner without readable text"],
    ocean: ["Ocean Rocks", "City Skyline", "Sunset Ocean", "Golden Hour", "Backlight", "Ocean Reflection", "Soft Wind", "Pink Sky", "Boardwalk", "Pier", "Yacht Deck", "Cliff Viewpoint", "Stone Seawall", "Harbor Walkway"],
    premium: ["Yacht", "Private Villa", "Pool Villa", "Tropical Cottage", "Thatched Roof", "White Stucco Corridor", "Bougainvillea Wall", "White Villa Pool Courtyard", "Palm Garden", "Flower Garden", "Villa Gate"],
  },
  poseLibrary: {
    adjustHair: "Adjust Hair",
    adjustStrap: "Adjust Shoulder Strap, product feature still visible",
    beachWalk: "Beach Walk, one foot forward, hair blowing, looking sideways",
    coverMouth: "Cover Mouth with one hand while wearing sunglasses, candid vacation mood",
    holdCoconut: "Hold Coconut Drink, natural squint under palm shadow",
    holdDrink: "Hold Iced Drink, relaxed natural laugh",
    holdStrawHat: "Hold Straw Hat",
    handShade: "Hand Shading Sun, natural squint, relaxed vacation expression",
    kneelPool: "Stand near pool edge with one leg forward, body relaxed, product front visible, no kneeling or sitting",
    leanStoneWall: "Lean on Ocean Stone Wall, side profile, distant sea and skyline",
    lookBack: "Look Back, side body turn, waist and back visible",
    mirrorSelfie: "Minimal resort room mirror selfie, phone covers part of face only when specified, product remains clear",
    poolSideSit: "Pool Side Sit, one hand behind, one hand touching hair",
    yachtLean: "Lean on Yacht Rail, one hand holding champagne glass, ocean horizon behind",
    sunglasses: "Adjust Sunglasses",
    touchDress: "Touch Dress, product feature visible",
  },
  expressionLibrary: {
    closedEyes: "Closed Eyes Smile",
    confident: "Confident",
    gentle: "Gentle",
    laugh: "Laugh",
    lookingAway: "Looking Away",
    lookingBack: "Looking Back",
    naturalSmile: "Natural Smile",
    playful: "Playful",
    relaxed: "Relaxed Vacation Mood",
    softSmile: "Soft Smile",
  },
  anatomyGuard: {
    arms: "2 arms",
    eyes: "2 eyes",
    feet: "2 feet when visible",
    fingers: "natural fingers, 5±1 visible fingers per hand",
    hands: "2 hands",
    legs: "2 legs",
    reject: "no extra limbs, no third hand, no fused hands, no malformed fingers",
  },
};

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/api/generate-stream") {
      const body = await readJson(req);
      await generateStream(body, res);
      return;
    }

    if (req.method === "POST" && req.url === "/api/generate-set") {
      const body = await readJson(req);
      const result = await generateSet(body);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "POST" && req.url === "/api/regenerate-image") {
      const body = await readJson(req);
      const result = await regenerateImage(body);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "POST" && req.url === "/api/export-set") {
      const body = await readJson(req, 80 * 1024 * 1024);
      const zip = await createExportZip(body?.record || body || {});
      res.writeHead(200, {
        "Content-Disposition": `attachment; filename="${zip.filename}"`,
        "Content-Length": zip.buffer.length,
        "Content-Type": "application/zip",
      });
      res.end(zip.buffer);
      return;
    }

    if (req.method === "POST" && req.url === "/api/style-library/import") {
      const body = await readJson(req, 120 * 1024 * 1024);
      const result = await importStyleLibraryImages(body?.images || []);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "GET" && req.url === "/api/style-library") {
      sendJson(res, 200, publicStyleLibrary(readStyleLibraryIndex()));
      return;
    }

    if (req.method === "GET") {
      serveStatic(req, res);
      return;
    }

    sendJson(res, 405, { error: "method_not_allowed" });
  } catch (error) {
    sendJson(res, error.status || 500, {
      error: "generation_failed",
      message: cleanProviderText(error.message || "生成失败"),
    });
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`端口 ${port} 已被占用，请换一个 PORT 后重试`);
    process.exit(1);
  }

  if (error.code === "EPERM" || error.code === "EACCES") {
    console.error(`无法监听 ${host}:${port}，请检查 HOST/PORT 或本机权限`);
    process.exit(1);
  }

  throw error;
});

server.listen(port, host, () => {
  console.log(`ai agent running at http://${host}:${port}/index.html`);
});

async function generateSet(body) {
  const requestId = `gen-${Date.now().toString(36)}`;
  logStep(requestId, "start");
  const images = body?.images || {};
  if (!images.front?.dataUrl || !images.face?.dataUrl) {
    const error = new Error("请先上传商品正面图和模特");
    error.status = 400;
    throw error;
  }

  const references = buildReferenceImages(images);
  const analysisMode = normalizeAnalysisMode(body?.analysisMode);
  const plan = await createGenerationPlan(images, requestId, undefined, {
    analysisMode,
  });
  const generatedAt = formatGeneratedTime(new Date());
  const generated = await Promise.all(
    imageTypes.map(async (imageType, index) => {
      const scene = plan.scenes?.[index] || {};
      const prompt = plan.prompts?.[index] || fallbackPrompt(index, plan.product_analysis);
      const type = scene.title || imageType;
      return generateOneImage({
        generatedAt,
        index,
        prompt,
        references: referencesForImageType(references, type, index),
        requestId,
        startedAt: Date.now(),
        type,
      });
    })
  );
  logStep(requestId, "done");

  return {
    directorPlan: plan.directorPlan || [],
    analysisMode: plan.analysisMode,
    generatedAt,
    images: generated,
    jpMarketStrategy: plan.jp_market_strategy || {},
    prompts: plan.prompts,
    scenes: plan.scenes,
    visualStandardLibrary: plan.visualStandardLibrary || publicVisualStandardLibrary(),
    modelTrace: {
      analysis: "reference-only",
      analysisMode: plan.analysisMode,
      planner: plan.mode || "visual-director-v1",
      seedream: process.env.ARK_IMAGE_MODEL || process.env.SEEDDREAM_MODEL,
    },
  };
}

async function generateStream(body, res) {
  const requestId = `stream-${Date.now().toString(36)}`;
  const startedAt = Date.now();
  const images = body?.images || {};

  res.writeHead(200, {
    "Cache-Control": "no-cache, no-transform",
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "X-Accel-Buffering": "no",
  });

  const writeEvent = (event) => {
    if (!res.destroyed) {
      res.write(`${JSON.stringify(event)}\n`);
    }
  };

  try {
    logStep(requestId, "start");
    if (!images.front?.dataUrl || !images.face?.dataUrl) {
      logStep(requestId, "missing-required-images");
      writeEvent({
        message: "请先上传商品正面图和模特",
        type: "error",
      });
      res.end();
      return;
    }

    const references = buildReferenceImages(images);
    const analysisMode = normalizeAnalysisMode(body?.analysisMode);
    const plan = await createGenerationPlan(images, requestId, (event) => {
      writeEvent({
        referencesUsed: publicReferences(references),
        ...event,
      });
    }, {
      analysisMode,
    });

    const generatedAt = formatGeneratedTime(new Date());
    const generated = new Array(imageTypes.length);
    const errors = new Array(imageTypes.length);

    await Promise.allSettled(
      imageTypes.map(async (imageType, index) => {
        const scene = plan.scenes?.[index] || {};
        const prompt = plan.prompts?.[index] || fallbackPrompt(index, plan.product_analysis);
        const type = scene.title || imageType;

        try {
          const result = await generateOneImage({
            generatedAt,
            index,
            prompt,
            references: referencesForImageType(references, type, index),
            requestId,
            startedAt,
            type,
            writeEvent,
          });

          generated[index] = result;
        } catch (error) {
          const elapsedSeconds = elapsedSince(startedAt);
          const failure = {
            elapsedSeconds,
            index,
            message: cleanProviderText(error.message || "图片生成失败"),
            type,
          };

          errors[index] = failure;
          logStep(requestId, `seedream:${index + 1}:error:${failure.message}`);
          writeEvent({
            error: failure,
            index,
            type: "image_error",
          });
        }
      })
    );

    const record = {
      analysisMode: plan.analysisMode,
      directorPlan: plan.directorPlan || [],
      errors: errors.filter(Boolean),
      generatedAt,
      images: generated.filter(Boolean),
      jpMarketStrategy: plan.jp_market_strategy || {},
      prompts: plan.prompts,
      referencesUsed: publicReferences(references),
      scenes: plan.scenes,
      visualStandardLibrary: plan.visualStandardLibrary || publicVisualStandardLibrary(),
      modelTrace: {
        analysis: "reference-only",
        analysisMode: plan.analysisMode,
        planner: plan.mode || "visual-director-v1",
        seedream: process.env.ARK_IMAGE_MODEL || process.env.SEEDDREAM_MODEL,
      },
    };

    logStep(requestId, "done");
    writeEvent({ record, type: "done" });
    res.end();
  } catch (error) {
    logStep(requestId, `error:${error.message}`);
    writeEvent({
      message: cleanProviderText(error.message || "生成失败"),
      type: "error",
    });
    res.end();
  }
}

async function regenerateImage(body) {
  const requestId = `regen-${Date.now().toString(36)}`;
  const startedAt = Date.now();
  const images = body?.images || {};
  const index = Number(body?.index);

  if (!Number.isInteger(index) || index < 0 || index >= imageTypes.length) {
    const error = new Error("刷新图片序号无效");
    error.status = 400;
    throw error;
  }

  if (!images.front?.dataUrl || !images.face?.dataUrl) {
    const error = new Error("请先上传商品正面图和模特");
    error.status = 400;
    throw error;
  }

  logStep(requestId, `start:${index + 1}`);
  const references = buildReferenceImages(images);
  const scene = body?.scene && typeof body.scene === "object" ? body.scene : {};
  const type = body?.type || scene.title || imageTypes[index];
  const prompt = body?.prompt || fallbackPrompt(index, defaultProductAnalysis("reference-only"));
  const image = await generateOneImage({
    generatedAt: body?.generatedAt || formatGeneratedTime(new Date()),
    index,
    prompt,
    references: referencesForImageType(references, type, index),
    requestId,
    startedAt,
    type,
  });
  logStep(requestId, `done:${index + 1}`);

  return { image };
}

async function importStyleLibraryImages(images) {
  const list = Array.isArray(images) ? images.filter((image) => image?.dataUrl) : [];
  if (list.length === 0) {
    const error = new Error("请先选择风格参考图");
    error.status = 400;
    throw error;
  }

  ensureStyleLibraryDirs();
  const index = readStyleLibraryIndex();
  const imported = [];

  for (const image of list) {
    const id = `style-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const imageData = decodeDataUrlImage(image.dataUrl);
    const extension = extensionFromContentType(imageData.contentType);
    const filename = `${id}.${extension}`;
    const imagePath = path.join(styleLibraryImageDir, filename);
    fs.writeFileSync(imagePath, imageData.buffer);

    const metadata = await analyzeStyleReferenceImage({
      dataUrl: image.dataUrl,
      sourceName: image.name || filename,
    });
    const record = normalizeStyleReferenceRecord({
      ...metadata,
      createdAt: new Date().toISOString(),
      filename,
      id,
      sourceName: image.name || filename,
    });
    index.items.unshift(record);
    imported.push(record);
  }

  index.updatedAt = new Date().toISOString();
  writeStyleLibraryIndex(index);
  return {
    imported,
    library: publicStyleLibrary(index),
  };
}

async function analyzeStyleReferenceImage({ dataUrl, sourceName }) {
  const data = await callArkChat({
    model: doubaoAnalysisModel,
    messages: [
      {
        role: "user",
        content: [
          imageContent(dataUrl),
          {
            type: "text",
            text: `这是一张用于电商出图的“风格/动作参考图”。只学习拍摄方式、场景、构图、动作和道具，不学习人物身份，不学习人脸，不学习具体商品。

请输出严格 JSON：
{
  "productTypes": [],
  "sceneCategory": "",
  "sceneKeywords": [],
  "props": [],
  "pose": "",
  "bodyOrientation": "",
  "handPlacement": "",
  "legPose": "",
  "propInteraction": "",
  "garmentVisibilityRisk": "low|medium|high",
  "suitableSlots": [],
  "lighting": "",
  "camera": "",
  "composition": "",
  "mood": "",
  "colorTone": "",
  "negativeTags": [],
  "summary": ""
}

字段要求：
1. productTypes 写适合的商品类型，例如 swimwear、dress、top、skirt、outerwear、daily-fashion、vacation-wear。
2. pose 是动作总述，例如 look back standing、walk with long-leg line、adjust hair standing、hold drink low while standing、hold bag low while standing、natural standing。
3. bodyOrientation 必须描述正面/侧身/背面/回头/站姿/轻靠站姿/行走长腿线条等，不要输出坐姿、跪姿、蹲姿或躺姿。
4. handPlacement 必须描述手部位置；如果拿道具，写清楚拿什么。
5. legPose 描述腿部姿态，例如 one leg forward、cross step standing、walking step with long-leg line、ankle-up standing line。
6. garmentVisibilityRisk 判断动作是否容易遮挡衣服卖点，主图/侧身图应优先 low。
7. suitableSlots 只能从 front, side, lifestyle, atmosphere, cover 中选择。
8. 不要 markdown，不要解释。`,
          },
        ],
      },
    ],
  }, doubaoAnalysisTimeoutMs);

  return parseJsonBlock(data.choices?.[0]?.message?.content || "");
}

function ensureStyleLibraryDirs() {
  fs.mkdirSync(styleLibraryImageDir, { recursive: true });
}

function readStyleLibraryIndex() {
  try {
    if (!fs.existsSync(styleLibraryIndexPath)) {
      return { items: [], updatedAt: null, version: 1 };
    }
    const parsed = JSON.parse(fs.readFileSync(styleLibraryIndexPath, "utf8"));
    return {
      items: Array.isArray(parsed.items) ? parsed.items.map(normalizeStyleReferenceRecord) : [],
      updatedAt: parsed.updatedAt || null,
      version: parsed.version || 1,
    };
  } catch {
    return { items: [], updatedAt: null, version: 1 };
  }
}

function writeStyleLibraryIndex(index) {
  ensureStyleLibraryDirs();
  fs.writeFileSync(styleLibraryIndexPath, JSON.stringify(index, null, 2));
}

function publicStyleLibrary(index) {
  const items = Array.isArray(index?.items) ? index.items : [];
  return {
    count: items.length,
    items: items.slice(0, 60),
    updatedAt: index?.updatedAt || null,
    version: index?.version || 1,
  };
}

function normalizeStyleReferenceRecord(value = {}) {
  const suitableSlots = normalizeStringArray(value.suitableSlots || value.suitable_slots)
    .map((slot) => slot.toLowerCase())
    .filter((slot) => ["front", "side", "lifestyle", "atmosphere", "cover"].includes(slot));
  const risk = String(value.garmentVisibilityRisk || value.garment_visibility_risk || "medium").toLowerCase();
  return {
    bodyOrientation: stringOrDefault(value.bodyOrientation || value.body_orientation, "natural standing"),
    camera: stringOrDefault(value.camera, "50mm natural ecommerce framing"),
    colorTone: stringOrDefault(value.colorTone || value.color_tone, "clean natural color"),
    composition: stringOrDefault(value.composition, "vertical ecommerce composition"),
    createdAt: stringOrDefault(value.createdAt, new Date().toISOString()),
    filename: stringOrDefault(value.filename, ""),
    garmentVisibilityRisk: ["low", "medium", "high"].includes(risk) ? risk : "medium",
    handPlacement: stringOrDefault(value.handPlacement || value.hand_placement, "natural hands, do not cover product features"),
    id: stringOrDefault(value.id, `style-${Date.now().toString(36)}`),
    legPose: stringOrDefault(value.legPose || value.leg_pose, "natural long-leg pose"),
    lighting: stringOrDefault(value.lighting, "natural soft light"),
    mood: stringOrDefault(value.mood, "real ecommerce lifestyle mood"),
    negativeTags: normalizeStringArray(value.negativeTags || value.negative_tags),
    pose: stringOrDefault(value.pose, "natural standing"),
    productTypes: normalizeStringArray(value.productTypes || value.product_types).map((item) => item.toLowerCase()),
    propInteraction: stringOrDefault(value.propInteraction || value.prop_interaction, "none"),
    props: normalizeStringArray(value.props),
    sceneCategory: stringOrDefault(value.sceneCategory || value.scene_category, "lifestyle"),
    sceneKeywords: normalizeStringArray(value.sceneKeywords || value.scene_keywords),
    sourceName: stringOrDefault(value.sourceName, "style reference"),
    suitableSlots: suitableSlots.length ? suitableSlots : inferSuitableSlots(value),
    summary: stringOrDefault(value.summary, ""),
  };
}

function inferSuitableSlots(value = {}) {
  const text = [
    value.pose,
    value.bodyOrientation || value.body_orientation,
    value.summary,
    value.sceneCategory || value.scene_category,
  ].join(" ").toLowerCase();
  if (text.includes("look back") || text.includes("back") || text.includes("side")) return ["side", "atmosphere"];
  if (text.includes("walk") || text.includes("drink") || text.includes("bag")) return ["lifestyle", "cover"];
  if (text.includes("hair") || text.includes("sunglasses") || text.includes("cover")) return ["atmosphere", "cover"];
  return ["front", "lifestyle", "cover"];
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 12);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/[,，、/|]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 12);
  }
  return [];
}

function decodeDataUrlImage(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.*)$/);
  if (!match) {
    throw new Error("风格图格式无效");
  }
  return {
    buffer: Buffer.from(match[2], "base64"),
    contentType: match[1] || "image/jpeg",
  };
}

function extensionFromContentType(contentType = "") {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  return "jpg";
}

async function createGenerationPlan(images, requestId, writeEvent = () => {}, options = {}) {
  const analysisMode = normalizeAnalysisMode(options.analysisMode);
  const analysis = defaultGenerationAnalysis("reference-only");

  logStep(requestId, "visual-director:start");
  writeEvent({
    analysisMode,
    message: "AI 正在按参考图生成视觉导演方案",
    type: "prompt_start",
  });

  const directorPlan = createDirectorPlan(analysis, requestId, readStyleLibraryIndex());
  const promptPlan = createVisualDirectorPromptPlan(analysis, directorPlan);

  const normalized = withReferencePromptRules({
    ...promptPlan,
    directorPlan,
    model_analysis: analysis.model_analysis,
    product_analysis: analysis.product_analysis,
    visualStandardLibrary: publicVisualStandardLibrary(),
  });
  normalized.analysisMode = analysisMode;
  normalized.mode = "visual-director-v1";
  logStep(requestId, "visual-director:done");
  writeEvent({
    analysisMode,
    directorPlan: normalized.directorPlan || directorPlan,
    jpMarketStrategy: normalized.jp_market_strategy || {},
    message: "AI 正在带参考图生成 6 张图片",
    mode: normalized.mode,
    prompts: normalized.prompts,
    scenes: normalized.scenes,
    visualStandardLibrary: normalized.visualStandardLibrary || publicVisualStandardLibrary(),
    type: "prompt_done",
  });
  return normalized;
}

function createDirectorPlan(analysis, requestId = "", styleIndex = readStyleLibraryIndex()) {
  const product = analysis?.product_analysis || {};
  const features = productFeatureList(product);
  const productProfile = productSceneProfile(product);
  const random = seededRandom(`${requestId}:${Date.now()}:${Math.random()}`);
  const styleCandidates = styleCandidatesForProduct(styleIndex, productProfile);
  const usage = {
    categories: new Set(),
    handPlacements: new Set(),
    poses: new Set(),
    props: new Set(),
    sceneFamilies: new Set(),
  };

  const slots = [
    {
      expression: visualStandardLibrary.expressionLibrary.softSmile,
      featureFocus: ["正面轮廓", "前襟/开口/闭合结构", "领口/肩部结构", "袖口/下摆", ...features.slice(0, 3)],
      purpose: "真实主图，提升点击和商品识别",
      qaFocus: ["identity", "bodyRatio", "garmentFront", "hands"],
      slot: "front",
      title: imageTypes[0],
      visibility: "low",
    },
    {
      expression: visualStandardLibrary.expressionLibrary.lookingBack,
      featureFocus: ["背面/侧面轮廓", "前襟边缘状态", "肩线/袖长", "下摆垂坠", ...features.slice(0, 3)],
      purpose: "展示背面/侧面版型和腰部卖点",
      qaFocus: ["identity", "bodyRatio", "garmentBack", "hands"],
      slot: "side",
      title: imageTypes[1],
      visibility: "low",
    },
    {
      expression: visualStandardLibrary.expressionLibrary.relaxed,
      featureFocus: ["整体穿搭", "商品轮廓", "前襟/开口/闭合结构", "面料垂坠"],
      purpose: "稳定轻生活展示图，用简单真实场景制造购买欲，同时优先保证人物协调和商品清晰",
      qaFocus: ["identity", "bodyRatio", "scene", "backgroundMatch", "hands", "garment"],
      slot: "lifestyle",
      title: imageTypes[2],
      visibility: "low",
    },
    {
      expression: visualStandardLibrary.expressionLibrary.closedEyes,
      featureFocus: ["商品轮廓", "领口/前襟", "袖子/下摆", "面料透感/垂坠"],
      purpose: "氛围种草图，提升整套图高级感",
      qaFocus: ["identity", "backgroundMatch", "photography", "hands", "series"],
      slot: "atmosphere",
      title: imageTypes[3],
      visibility: "high",
    },
    null,
    {
      expression: visualStandardLibrary.expressionLibrary.laugh,
      featureFocus: ["正面卖点", "前襟/开口/闭合结构", "整体穿搭", "商品轮廓"],
      purpose: "种草封面，适合 Little Red Book、Instagram、Vacation Diary",
      qaFocus: ["identity", "cover", "hands", "garment", "series"],
      slot: "cover",
      title: imageTypes[5],
      visibility: "medium",
    },
  ];

  return slots.map((slot, index) => {
    if (index === 4) return productDetailDirector(features);
    const candidate = chooseStyleCandidate(styleCandidates, slot, usage, random);
    markStyleUsage(candidate, usage);
    return directorFromStyleCandidate(candidate, slot, productProfile);
  });
}

function productDetailDirector(features = []) {
  return {
    camera: "structured ecommerce product-detail collage, left dominant main grid cell with complete full product view, right narrow vertical detail column, optional bottom-left inset detail cell, clean white gutters",
    environment: ["Left Dominant Main Product Cell", "Right Vertical Detail Column", "Bottom-left Detail Inset", "Cream Tonal Product Surface", "Clean Ecommerce Layout"],
    expression: "none",
    featureFocus: Array.from(new Set(["商品全貌", "前襟/开口/闭合结构", "领口/肩部结构", "袖口/下摆", "面料纹理", "图案/印花/波点", "结构褶皱", "层叠/边缘", "关键装饰", "做工细节", ...features.slice(0, 4)])),
    lighting: "soft natural commercial light, accurate fabric texture, no human shadow, cream tonal surface, clean white gutters, natural soft product shadow, product remains dominant",
    pose: `无人物，主大次小。${productDetailLayoutStandard}${productDetailFullViewGuard}${productDetailSmallCellsGuard}${productDetailSmallCellsNoRepeatGuard}`,
    purpose: "商品细节卖点图，只服务商品理解",
    qaFocus: ["noPerson", "garment", "detailGrid"],
    reason: `细节图必须排除人体干扰，用左侧大主宫格展示完整全貌，用右侧窄竖列和左下角补图展示不重复、不空白的真实细节；${productDetailSmallCellsNoRepeatGuard}${productDetailBan}`,
    sceneCategory: "Product Detail",
    sceneFamily: "product-detail",
    source: "fixed-product-detail",
    title: imageTypes[4],
  };
}

function productSceneProfile(product = {}) {
  const text = [
    product.category,
    product.style,
    product.silhouette,
    product.pattern,
    ...(Array.isArray(product.key_details) ? product.key_details : []),
    ...(Array.isArray(product.selling_points) ? product.selling_points : []),
  ].join(" ").toLowerCase();
  const vacation = /泳|swim|bikini|beach|vacation|度假|吊带|裙式泳衣|沙滩/.test(text);
  const dress = /dress|裙|连衣裙|半裙/.test(text);
  const outerwear = /outer|coat|jacket|外套|夹克|大衣/.test(text);
  const top = /top|shirt|blouse|tee|上衣|衬衫|吊带/.test(text);
  return {
    labels: [
      vacation ? "swimwear" : "",
      vacation ? "vacation-wear" : "",
      dress ? "dress" : "",
      outerwear ? "outerwear" : "",
      top ? "top" : "",
      "daily-fashion",
    ].filter(Boolean),
    mood: vacation ? "Japanese summer vacation ecommerce" : "Japanese daily ecommerce lifestyle",
    vacation,
  };
}

function styleCandidatesForProduct(styleIndex = {}, profile = productSceneProfile({})) {
  const libraryItems = Array.isArray(styleIndex.items) ? styleIndex.items : [];
  const normalized = libraryItems.map(normalizeStyleReferenceRecord);
  const matching = normalized.filter((item) => {
    if (!item.productTypes.length) return true;
    return item.productTypes.some((type) => profile.labels.includes(type) || type === "daily-fashion");
  });
  return [...matching, ...builtinStyleCandidates(profile)];
}

function builtinStyleCandidates(profile) {
  const vacation = profile.vacation;
  const base = [
    styleCandidate("front", "low", "natural standing in clean studio daylight", "front three-quarter", "one hand relaxed beside body, do not cover chest or waist", "one leg forward long-leg line", "none", "clean studio window / white wall / soft daylight", ["studio window", "white wall", "soft side light"], [], "front-studio"),
    styleCandidate("front", "low", "catalog standing beside linen curtain", "front three-quarter", "one hand lightly touches dress edge, chest remains clear", "ankle-up standing line", "linen curtain only as background texture", "resort room window / linen curtain / pale floor", ["resort room", "linen curtain", "soft side light"], ["linen curtain"], "front-window"),
    styleCandidate("side", "low", "look back beside open window", "side/back look back", "hands relaxed near waist, keep waist bow visible", "cross step side pose", "none", "resort room open window / sheer curtain / soft side light", ["open window", "sheer curtain", "soft side light"], [], "side-window"),
    styleCandidate("side", "low", "side turn in white corridor", "side/back look back", "one hand touches hair, other hand relaxed near hip", "cross step side pose", "none", "white stucco corridor / villa arch shadow / clean wall", ["white corridor", "arch shadow", "clean architecture"], [], "side-corridor"),
    styleCandidate("lifestyle", "low", "stable standing at cafe doorway", "front three-quarter, slight relaxed turn", "both hands relaxed beside body or one hand lightly touches dress edge, do not cover chest or waist", "one leg slightly forward, feet grounded, ankle-up stable standing line", "none", "quiet beach town cafe doorway / wooden bench / natural daylight", ["cafe doorway", "wooden bench", "simple summer town"], [], "lifestyle-cafe-stable"),
    styleCandidate("lifestyle", "low", "stable standing beside marina railing", "front three-quarter, slight relaxed turn", "one hand lightly rests near railing, other hand relaxed beside body, do not cover waist", "one leg slightly forward, feet grounded, ankle-up stable standing line", "none", "marina boardwalk / simple rope railing / clean blue sky", ["marina boardwalk", "simple railing", "blue sky"], [], "lifestyle-marina-stable"),
    styleCandidate("atmosphere", "medium", "adjust hair in flower garden backlight", "relaxed standing, head turned", "one hand touches hair", "standing long-leg line", "flower hair clip optional", "flower villa gate / bougainvillea / late afternoon backlight", ["villa gate", "bougainvillea", "backlight"], ["flower hair clip"], "atmosphere-garden"),
    styleCandidate("atmosphere", "medium", "lean near rattan sunroom chair", "relaxed side standing", "one hand on chair back, one hand relaxed", "standing long-leg line", "rattan chair", "rattan sunroom corner / open window / airy shadow", ["rattan sunroom", "open window", "airy shadow"], ["rattan chair"], "atmosphere-indoor"),
    styleCandidate("cover", "medium", "touch dress or hold small bag with natural smile", "front cover standing", "one hand touches dress edge, one hand holds small bag low", "one leg forward cover pose", "small bag", "cafe terrace / bright editorial cover / clean table edge", ["cafe terrace", "bright cover", "editorial ecommerce"], ["small bag"], "cover-cafe"),
    styleCandidate("cover", "medium", "stand beside white changing curtain with soft smile", "front cover standing", "one hand adjusts hair, other relaxed by side", "one leg forward cover pose", "none", "white changing room curtain / beach shower tiles / clean summer light", ["changing curtain", "beach shower tiles", "clean summer light"], [], "cover-changing-room"),
  ];
  if (!vacation) return base;
  return [
    styleCandidate("front", "low", "natural standing by pool garden", "front three-quarter", "light hand-shading sun or relaxed hand beside body", "one leg forward long-leg line", "none", "pool garden / bougainvillea / palm shadow", ["pool garden", "bougainvillea", "palm shadow"], [], "front-pool-once"),
    styleCandidate("front", "low", "main image standing near beach shower tiles", "front three-quarter", "one hand relaxed, one hand lightly adjusts strap without covering chest", "one leg forward long-leg line", "none", "beach shower tiled wall / white curtain / wet floor reflection", ["beach shower tiles", "white curtain", "wet floor reflection"], [], "front-shower"),
    styleCandidate("side", "low", "look back on sea-view balcony", "side/back look back", "hands relaxed near waist, keep back bow visible", "cross step side pose", "none", "sea-view balcony / sheer curtain / soft window light", ["sea-view balcony", "sheer curtain", "ocean view"], [], "side-balcony"),
    styleCandidate("side", "low", "look back beside flower villa wall", "side/back look back", "one hand touches hair, other hand near waist without blocking bow", "cross step side pose", "none", "bougainvillea villa wall / white stucco / side sunlight", ["bougainvillea", "white stucco", "side sunlight"], [], "side-garden"),
    styleCandidate("lifestyle", "low", "stable standing beside fruit juice counter", "front three-quarter, slight relaxed turn", "both hands relaxed beside body or one hand lightly touches dress edge, no drink in hand", "one leg slightly forward, feet grounded, ankle-up stable standing line", "none", "beach town fruit juice counter / blurred generic sign / palm shade", ["fruit juice counter", "blurred generic sign", "palm shade"], [], "lifestyle-juice-stable"),
    styleCandidate("lifestyle", "low", "stable standing on harbor boardwalk", "front three-quarter, slight relaxed turn", "hands relaxed low beside body, no hat in hand", "one leg slightly forward, feet grounded, ankle-up stable standing line", "none", "harbor boardwalk / white boats in distance / morning light", ["harbor boardwalk", "white boats", "morning light"], [], "lifestyle-harbor-stable"),
    styleCandidate("lifestyle", "low", "stable standing on palm garden path", "front three-quarter, slight relaxed turn", "hands relaxed low beside body, no basket in hand", "one leg slightly forward, feet grounded, ankle-up stable standing line", "none", "palm garden walkway / stone path / dappled sunlight", ["palm garden", "stone path", "dappled sunlight"], [], "lifestyle-garden-stable"),
    styleCandidate("atmosphere", "medium", "adjust hair beside ocean rocks", "relaxed standing, head turned", "one hand touches hair", "standing long-leg line near stone wall", "sunglasses optional", "ocean rocks / golden hour / sea wind", ["ocean rocks", "golden hour", "sea wind"], ["sunglasses"], "atmosphere-ocean"),
    styleCandidate("atmosphere", "medium", "soft pose by resort room window", "relaxed side standing", "one hand touches curtain edge, one hand relaxed", "standing long-leg line", "linen curtain", "resort room window / linen curtain / late afternoon side light", ["resort room", "linen curtain", "late afternoon side light"], ["linen curtain"], "atmosphere-room"),
    styleCandidate("atmosphere", "medium", "sunlit flower gate hair adjustment", "relaxed standing, head turned", "one hand adjusts hair", "standing long-leg line", "flower hair clip optional", "flower villa gate / tropical garden / warm backlight", ["flower villa gate", "tropical garden", "warm backlight"], ["flower hair clip"], "atmosphere-flower-gate"),
    styleCandidate("cover", "medium", "hold straw tote under beach umbrella", "front cover standing", "one hand holds straw tote low, one hand touches dress edge", "one leg forward cover pose", "straw tote", "striped beach umbrella / rattan sofa / bright cafe terrace", ["striped umbrella", "rattan sofa", "bright cafe terrace"], ["straw tote"], "cover-umbrella"),
    styleCandidate("cover", "medium", "marina cover pose with sunglasses", "front cover standing", "one hand adjusts sunglasses, other hand relaxed by side", "one leg forward cover pose", "sunglasses", "wooden pier marina / sunlit railing / ocean depth", ["wooden pier", "marina railing", "ocean depth"], ["sunglasses"], "cover-marina"),
    styleCandidate("cover", "medium", "beach cafe cover with fruit cup", "front cover standing", "one hand holds fruit cup low, one hand touches hair", "one leg forward cover pose", "fruit cup", "beach cafe terrace / rattan chair / clean summer shadow", ["beach cafe terrace", "rattan chair", "clean shadow"], ["fruit cup"], "cover-fruit-cafe"),
    ...base,
  ];
}

function styleCandidate(slot, risk, pose, bodyOrientation, handPlacement, legPose, propInteraction, sceneCategory, sceneKeywords, props, source) {
  return normalizeStyleReferenceRecord({
    bodyOrientation,
    camera: "50mm lens, hip-to-waist camera height, slight low angle, vertical full-body or ankle-up ecommerce framing, model fills 86%-94% frame height, calves/ankles visible when possible",
    colorTone: "clean Japanese ecommerce color",
    composition: "vertical full-body or ankle-up commercial ecommerce composition, head-to-ankle long vertical body line",
    garmentVisibilityRisk: risk,
    handPlacement,
    legPose,
    lighting: sceneCategory,
    mood: "realistic Japanese ecommerce lifestyle mood",
    pose,
    productTypes: ["swimwear", "vacation-wear", "dress", "daily-fashion"],
    propInteraction,
    props,
    sceneCategory,
    sceneKeywords,
    sourceName: `builtin-${source}`,
    suitableSlots: [slot],
    summary: `${pose} in ${sceneCategory}`,
  });
}

function chooseStyleCandidate(candidates, slot, usage, random) {
  const relaxedCandidates = candidates.filter((candidate) => isCandidateAllowedForSlot(candidate, slot));
  const primaryCandidates = primaryCandidatesForSlot(relaxedCandidates, slot);
  const fallbackCandidates = candidates.filter((candidate) => isCandidateAllowedForSlot(candidate, slot, { fallback: true }));
  const builtinFallback = builtinStyleCandidates(productSceneProfile({})).filter((candidate) => candidate.suitableSlots.includes(slot.slot));
  const pool = styleCandidatePoolForSlot(slot, primaryCandidates, relaxedCandidates, fallbackCandidates, builtinFallback);
  const diversePool = pool.filter((candidate) => !usage.sceneFamilies.has(sceneFamily(candidate)));
  const finalPool = diversePool.length ? diversePool : pool;
  const duplicates = styleCandidateDuplicateStats(finalPool);
  const scored = finalPool
    .map((candidate) => ({
      candidate,
      score: styleCandidateScore(candidate, slot, usage, duplicates),
    }));
  return weightedRandomChoice(scored, random) || finalPool[0] || pool[0];
}

function styleCandidatePoolForSlot(slot, primaryCandidates, relaxedCandidates, fallbackCandidates, builtinFallback) {
  const minimum = minimumRelaxedPoolSize(slot);
  if (primaryCandidates.length >= minimum) return primaryCandidates;
  if (relaxedCandidates.length >= minimum) return relaxedCandidates;
  if (fallbackCandidates.length) return fallbackCandidates;
  return builtinFallback;
}

function minimumRelaxedPoolSize(slot) {
  return slot.slot === "side" ? 4 : 1;
}

function primaryCandidatesForSlot(candidates, slot) {
  const exact = candidates.filter((candidate) => (candidate.suitableSlots || []).includes(slot.slot));
  if (slot.slot === "lifestyle") {
    const stableExact = exact.filter(isStableLifestyleCandidate);
    if (stableExact.length) return stableExact;
  }
  if (slot.slot !== "side") return exact.length ? exact : candidates;
  const focusedExact = exact.filter(isSideFocusedCandidate);
  if (focusedExact.length) return focusedExact;
  if (exact.length) return exact;
  return candidates.filter(isSideFocusedCandidate);
}

function isStableLifestyleCandidate(candidate) {
  const text = [
    candidate.pose,
    candidate.bodyOrientation,
    candidate.handPlacement,
    candidate.legPose,
    candidate.propInteraction,
    candidate.summary,
  ].join(" ").toLowerCase();
  if (/walk|walking|run|running|jump|kneel|kneeling|sit|sitting|seated|squat|crouch|lying|recline|lounge|drink|bottle|hat|bag|basket|tote|phone|selfie|drink|拿|走|行走|坐|跪|蹲|躺|跳|饮品|帽|包|篮|手机|自拍/.test(text)) {
    return false;
  }
  return /stand|standing|stable|relaxed|front|three-quarter|站|站姿|稳定|正面|微侧/.test(text);
}

function isShorteningPoseCandidate(candidate) {
  const text = [
    candidate?.pose,
    candidate?.bodyOrientation,
    candidate?.handPlacement,
    candidate?.legPose,
    candidate?.propInteraction,
    candidate?.summary,
    candidate?.composition,
    candidate?.camera,
  ].join(" ").toLowerCase();
  return /kneel|kneeling|sit|sitting|seated|squat|squatting|crouch|crouching|lying|laying|recline|reclining|lounge|lounging|cross[- ]legged|half[- ]body|knee[- ]up|thigh[- ]crop|坐|跪|蹲|躺|蜷腿|盘腿|半身|膝上|大腿截断/.test(text);
}

function relaxedSlotsForSlot(slot) {
  if (slot.slot === "front") return ["front", "lifestyle", "cover", "atmosphere"];
  if (slot.slot === "side") return ["side", "atmosphere", "front"];
  return ["front", "side", "lifestyle", "atmosphere", "cover"];
}

function isCandidateAllowedForSlot(candidate, slot, options = {}) {
  if (isShorteningPoseCandidate(candidate)) return false;
  const risk = candidate.garmentVisibilityRisk;
  if (risk === "high" && !["atmosphere", "cover"].includes(slot.slot)) return false;
  if (slot.visibility === "low" && risk === "high") return false;
  if (options.fallback && slot.slot === "side") return risk === "low" || risk === "medium";
  const slots = Array.isArray(candidate.suitableSlots) ? candidate.suitableSlots : [];
  return slots.some((candidateSlot) => relaxedSlotsForSlot(slot).includes(candidateSlot));
}

function weightedRandomChoice(scored, random) {
  const weighted = scored
    .map((item) => ({
      candidate: item.candidate,
      weight: Math.max(1, item.score),
    }))
    .filter((item) => item.candidate);
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return weighted[0]?.candidate;
  let threshold = random() * totalWeight;
  for (const item of weighted) {
    threshold -= item.weight;
    if (threshold <= 0) return item.candidate;
  }
  return weighted[weighted.length - 1]?.candidate;
}

function styleCandidateDuplicateStats(candidates) {
  const familyCounts = new Map();
  const sceneCounts = new Map();
  const poseCounts = new Map();
  candidates.forEach((candidate) => {
    incrementMap(familyCounts, sceneFamily(candidate));
    incrementMap(sceneCounts, styleKey(candidate.sceneCategory));
    incrementMap(poseCounts, styleKey(candidate.pose));
  });
  return { familyCounts, poseCounts, sceneCounts };
}

function incrementMap(map, key) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + 1);
}

function styleKey(value) {
  return String(value || "").trim().toLowerCase();
}

function sceneFamily(candidate) {
  const text = [
    candidate?.sceneCategory,
    ...(Array.isArray(candidate?.sceneKeywords) ? candidate.sceneKeywords : []),
    candidate?.summary,
  ].join(" ").toLowerCase();
  if (/studio|showroom|white wall|棚拍|白墙/.test(text)) return "studio";
  if (/beach shower|changing|shower|更衣|淋浴/.test(text)) return "changing-room";
  if (/yacht|marina|pier|dock|boardwalk|harbor|boat|码头|游艇|港/.test(text)) return "marina";
  if (/cafe|bar|restaurant|juice|ice cream|terrace|drink|咖啡|饮品/.test(text)) return "cafe";
  if (/pool|泳池/.test(text)) return "pool";
  if (/garden|flower|bougainvillea|palm|villa gate|花|庭|棕榈/.test(text)) return "garden";
  if (/street|shop|vending|walkway|town|corridor|lane|街|走廊/.test(text)) return "street";
  if (/room|window|curtain|mirror|indoor|sunroom|linen|balcony|室内|窗|帘|阳台/.test(text)) return "indoor";
  if (/ocean|sea|rock|cliff|seawall|海|礁石|悬崖/.test(text)) return "ocean";
  if (/beach|sand|umbrella|shore|沙滩|海滩/.test(text)) return "beach";
  return "lifestyle";
}

function styleCandidateScore(candidate, slot, usage, duplicates = styleCandidateDuplicateStats([])) {
  let score = 10;
  if (isShorteningPoseCandidate(candidate)) score -= 40;
  const slots = Array.isArray(candidate.suitableSlots) ? candidate.suitableSlots : [];
  if (slots.includes(slot.slot)) score += 8;
  else score -= 6;
  if (candidate.garmentVisibilityRisk === "low") score += slot.visibility === "low" ? 6 : 2;
  if (candidate.garmentVisibilityRisk === "high" && slot.visibility !== "high") score -= 8;
  if (slot.slot === "side") score += sideCandidateScore(candidate);
  if (slot.slot === "lifestyle") score += stableLifestyleScore(candidate);
  const family = sceneFamily(candidate);
  if (!usage.sceneFamilies.has(family)) score += 8;
  else score -= 7;
  if (!usage.categories.has(candidate.sceneCategory)) score += 4;
  else score -= 2;
  if (!usage.poses.has(candidate.pose)) score += 5;
  if (!usage.handPlacements.has(candidate.handPlacement)) score += 2;
  const propKey = primaryProp(candidate);
  if (!propKey || !usage.props.has(propKey)) score += 3;
  else score -= 3;
  const familyRepeat = duplicates.familyCounts.get(family) || 1;
  const sceneRepeat = duplicates.sceneCounts.get(styleKey(candidate.sceneCategory)) || 1;
  const poseRepeat = duplicates.poseCounts.get(styleKey(candidate.pose)) || 1;
  score -= Math.min(12, (familyRepeat - 1) * 2 + (sceneRepeat - 1) * 1.5 + (poseRepeat - 1) * 1.5);
  return score;
}

function stableLifestyleScore(candidate) {
  const text = [
    candidate.pose,
    candidate.bodyOrientation,
    candidate.handPlacement,
    candidate.legPose,
    candidate.propInteraction,
    candidate.summary,
  ].join(" ").toLowerCase();
  let score = 0;
  if (isStableLifestyleCandidate(candidate)) score += 10;
  if (/stand|standing|stable|relaxed|front three-quarter|站|站姿|稳定|正面|微侧/.test(text)) score += 5;
  if (/none|relaxed|no prop|无道具/.test(text)) score += 3;
  if (/walk|walking|run|jump|kneel|kneeling|sit|sitting|seated|squat|crouch|lying|recline|lounge|drink|bottle|hat|bag|basket|tote|phone|selfie|走|行走|坐|跪|蹲|躺|跳|饮品|帽|包|篮|手机|自拍/.test(text)) score -= 14;
  return score;
}

function sideCandidateScore(candidate) {
  let score = 0;
  if ((candidate.suitableSlots || []).includes("side")) score += 8;
  if (isSideFocusedCandidate(candidate)) score += 6;
  if (isMirrorSelfieCandidate(candidate)) score -= 4;
  return score;
}

function isSideFocusedCandidate(candidate) {
  const text = [
    candidate.pose,
    candidate.bodyOrientation,
    candidate.handPlacement,
    candidate.legPose,
    candidate.summary,
    candidate.sceneCategory,
  ].join(" ").toLowerCase();
  return /side|back|look back|背|侧|回头|腰/.test(text);
}

function isMirrorSelfieCandidate(candidate) {
  const text = [
    candidate.pose,
    candidate.bodyOrientation,
    candidate.propInteraction,
    candidate.summary,
    candidate.sceneCategory,
  ].join(" ").toLowerCase();
  return /mirror selfie|phone/.test(text);
}

function markStyleUsage(candidate, usage) {
  usage.categories.add(candidate.sceneCategory);
  usage.poses.add(candidate.pose);
  usage.handPlacements.add(candidate.handPlacement);
  usage.sceneFamilies.add(sceneFamily(candidate));
  const propKey = primaryProp(candidate);
  if (propKey) usage.props.add(propKey);
}

function primaryProp(candidate) {
  const props = Array.isArray(candidate.props) ? candidate.props : [];
  const prop = props[0] || candidate.propInteraction;
  const value = String(prop || "").toLowerCase();
  if (!value || value === "none") return "";
  if (value.includes("drink") || value.includes("coconut")) return "drink";
  if (value.includes("hat")) return "hat";
  if (value.includes("bag") || value.includes("tote")) return "bag";
  if (value.includes("sunglass")) return "sunglasses";
  return value;
}

function directorFromStyleCandidate(candidate, slot, productProfile) {
  const environment = [
    candidate.sceneCategory,
    ...candidate.sceneKeywords,
    candidate.colorTone,
  ].filter(Boolean).slice(0, 8);
  return {
    bodyOrientation: candidate.bodyOrientation,
    camera: candidate.camera,
    composition: candidate.composition,
    environment,
    expression: slot.expression,
    featureFocus: slot.featureFocus,
    garmentVisibilityRisk: candidate.garmentVisibilityRisk,
    handPlacement: candidate.handPlacement,
    legPose: candidate.legPose,
    lighting: candidate.lighting,
    mood: candidate.mood,
    pose: [
      candidate.pose,
      `Body Orientation：${candidate.bodyOrientation}`,
      `Hand Placement：${candidate.handPlacement}`,
      `Leg Pose：${candidate.legPose}`,
      `Prop Interaction：${candidate.propInteraction}`,
    ].join("；"),
    productProfile,
    propInteraction: candidate.propInteraction,
    props: candidate.props,
    purpose: slot.purpose,
    qaFocus: slot.qaFocus,
    reason: "由参考图风格库/动作池按商品类型和本轮去重规则动态抽样",
    sceneCategory: candidate.sceneCategory,
    sceneFamily: sceneFamily(candidate),
    source: candidate.sourceName?.startsWith("builtin-") ? "builtin-style-pool" : "style-library",
    styleReferenceId: candidate.id,
    title: slot.title,
    visibilityGuard: visibilityGuardForSlot(slot, candidate),
  };
}

function visibilityGuardForSlot(slot, candidate) {
  const base = `动作必须服从商品卖点露出，不能遮挡领口、前襟/开口/闭合结构、袖口、下摆、图案和关键装饰；如果手碰衣边，只能把左右前片轻轻分开展示，不能把衣服捏合、扣合或拉到中线。${garmentClosureStructureLock}${tallPoseHardLock}`;
  if (slot.slot === "front") return `${base} 主图只允许低遮挡动作，手臂不能横挡胸口或腰线，胸前必须看到开衫连续敞开的中间空隙。`;
  if (slot.slot === "side") return `${base} 侧身图必须露出背面/侧面轮廓、肩线、袖长和下摆状态。`;
  if (slot.slot === "lifestyle") return `${base} 图三稳定优先，只允许正面或微侧站姿、低动作、少道具或无道具；禁止行走大跨步、坐姿、跪姿、手机自拍、手持饮品/包/草帽遮挡商品。`;
  if (candidate.garmentVisibilityRisk === "high") return `${base} 本动作遮挡风险高，只允许作为氛围/封面情绪，商品主体仍要清楚。`;
  return base;
}

function seededRandom(seed) {
  let value = 2166136261;
  const text = String(seed || "seed");
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function createVisualDirectorPromptPlan(analysis, directorPlan) {
  return {
    directorPlan,
    jp_market_strategy: {
      target_platform: "SHEIN Japan / Qoo10 JP / Rakuten / Little Red Book / Instagram",
      visual_direction: "AI Visual Director: 真实淘宝/小红书泳衣种草，以棚拍窗边、民宿房间、海边小镇咖啡、花园门廊、码头木栈道、局部泳池/海景等多场景胶囊轮换，真实手机感与日系电商转化并重",
      customer_emotion: "甜美、真实、高级度假、可信、想下单",
      conversion_logic: "用同一模特和商品卖点建立信任，每张只选择一个明确场景胶囊和 1-2 个生活道具，让场景家族、建筑元素、光线时间和机位明显分散",
      avoid_style: ["普通沙滩游客照", "六次独立 AI 生成感", "第三只手", "AI 美颜脸", "背景抠图感", "商品细节被遮挡", "可读文字/水印/Logo", "过度豪华 CGI 酒店", "重复泳池背景", "矮小感", "短腿", "头大身短", "大腿中部截断", "膝上截断", "半身压缩", "高机位俯拍", "坐姿压缩", "跪姿压缩", "蹲姿", "躺姿", "平均死板商品宫格"],
    },
    prompts: directorPlan.map((director, index) => composeVisualDirectorPrompt(analysis, director, index)),
    scenes: directorPlan.map((director) => ({
      bodyOrientation: director.bodyOrientation,
      camera: director.camera,
      garmentVisibilityRisk: director.garmentVisibilityRisk,
      handPlacement: director.handPlacement,
      legPose: director.legPose,
      expression: director.expression,
      jp_style: director.sceneCategory,
      pose: director.pose,
      propInteraction: director.propInteraction,
      purpose: director.purpose,
      sceneFamily: director.sceneFamily,
      source: director.source,
      setting: director.environment.join(" / "),
      title: director.title,
      visibilityGuard: director.visibilityGuard,
    })),
    visualStandardLibrary: publicVisualStandardLibrary(),
  };
}

function composeVisualDirectorPrompt(analysis, director, index) {
  const product = analysis?.product_analysis || {};
  const model = analysis?.model_analysis || {};
  const detailImage = index === 4;
  const featureText = director.featureFocus.join("、");
  const environmentText = director.environment.join("、");

  if (detailImage) {
    const cellPlan = productDetailCellPlan(product, director.featureFocus);
    return [
      "AI Visual Director 商品细节图。",
      "Scene Standard：Structured Product Detail Collage, Left Dominant Main Product Cell, Right Vertical Detail Column, Bottom-left Detail Inset, Clean White Gutters, Cream Tonal Product Surface。",
      `Product Reference Rule：${productOnlyAnalysisText(product)}。`,
      `Garment Closure Hard Lock：${garmentClosureStructureLock}`,
      `Feature Visibility：${featureText}。`,
      `Detail Cell Plan：${cellPlan}。`,
      `Composition：主大次小。${productDetailLayoutStandard}${productDetailFullViewGuard}${productDetailSmallCellsGuard}${productDetailSmallCellsNoRepeatGuard}`,
      "Photography Standard：structured ecommerce product-detail collage, left dominant main product catalog view, right vertical macro detail cells, optional bottom-left inset cell, soft natural commercial light, accurate fabric texture, correct gravity, natural fabric drape, clean white gutters, cream-beige surface, soft product shadow。",
      "No Empty / No Duplicate Cells：every small detail cell must be filled with a different real product macro detail from the references; no blank cell, no placeholder, no repeated crop, no duplicated fabric patch, no empty white/cream block。",
      `Strict Ban：${productDetailBan}`,
      "Product Consistency：100% follow product reference images for color, pattern, silhouette, material, edges, trims, opening/closure state and all key details; product-detail main cell must show the open cardigan front with separated panels, no button placket or closed center strip。",
    ].join("\n");
  }

  return [
    "AI Visual Director 人物电商图。",
    `Scene Director：${director.title}；${director.purpose}。`,
    `Scene Standard：${environmentText}。`,
    `Pose Standard：${director.pose}。`,
    `Dynamic Action Block：Scene Family=${director.sceneFamily || "lifestyle"}；Pose Source=${director.source || "style-pool"}；Body Orientation=${director.bodyOrientation || "natural"}；Hand Placement=${director.handPlacement || "natural hands"}；Leg Pose=${director.legPose || "natural long-leg pose"}；Prop Interaction=${director.propInteraction || "none"}；Visibility Guard=${director.visibilityGuard || "动作不能遮挡商品卖点"}。`,
    `Tall Body Hard Lock：${tallPoseHardLock}`,
    `Expression Standard：${director.expression}。`,
    `Lighting：${director.lighting}。`,
    `Camera：${director.camera}。`,
    `Product Reference Rule：${analysisText(product)}。`,
    `Garment Closure Hard Lock：${garmentClosureStructureLock}`,
    `Model Analysis：脸=${model.face || "以模特参考图为准"}；发型=${model.hair || "以模特参考图为准"}；体态=${model.body || "Slim Fashion Model"}；气质=${model.vibe || "自然真实"}。`,
    `Feature Visibility：动作不能遮挡核心卖点，必须露出 ${featureText}。`,
    `Reference Style Learning：${visualStandardLibrary.referenceStyleLibrary.mood}；从多场景胶囊学习，但本张只执行 Scene Standard，不要自动回到泳池模板。`,
    `Learned Scene Capsules：${visualStandardLibrary.referenceStyleLibrary.scenes.join("、")}。`,
    `Prop Rule：只选 1-2 个自然道具（${visualStandardLibrary.referenceStyleLibrary.props.join("、")}），不能把所有道具塞进同一张；道具不能遮挡商品卖点。`,
    "Real Social Content Standard：像真实淘宝/小红书服装搭配图，有轻微环境瑕疵、真实阳光阴影、风吹头发和生活道具；不要空洞奢华酒店渲染。",
    `Text/Watermark Ban：${visualStandardLibrary.referenceStyleLibrary.textBan}。`,
    "Identity Lock：Same Person, Same Face, Same Hair, Same Makeup, Same Skin Tone, Same Height Visual Impression, Same Body Ratio, Same Photographer across all 6 images。",
    `Height Visual Standard：${personTallModelVisualStandard}`,
    "Face Realism Standard：visible pores, natural skin texture, tiny blemishes, subtle under-eye texture, natural nasolabial fold, real lip wrinkles, slight facial asymmetry, natural gaze, natural Japanese commercial makeup。",
    "Anti-AI Face Ban：no plastic skin, no doll face, no AI idol face, no over-bright eyes, no perfect symmetry, no beauty filter, no waxy skin, no anime look, no over-smoothed face, no over-sharpened face。",
    "Model Standard：real commercial model proportion, natural tall impression, 167–170cm professional model visual impression only, not an actual height description, natural continuous long legs but believable human anatomy, high waistline, natural shoulder, natural waist, natural hip, slight natural posture imperfection, stable body proportion; no petite look, no short legs, no large head, no 50/50 body ratio, no compressed torso-leg ratio, no knee-up crop, no thigh crop, no half-body compression, no sitting compression, no kneeling compression, no squatting, no reclining, no folded legs, no over-stretched body, no exaggerated tiny head, no mannequin-like body。",
    "Human Anatomy Guard：2 hands, 2 arms, 2 legs, 2 eyes, 2 feet when visible, natural fingers, 5±1 visible fingers per hand, no extra limbs, no third hand, no fused hands, no malformed fingers。",
    "Photography Standard：50mm lens, commercial fashion photography, unified Japanese ecommerce color temperature, natural perspective, soft shadow, bounce light, believable camera composition; hip-to-waist camera height, slight low angle without artificial body stretching, model fills 86%-94% frame height, full-body or ankle-up framing required, calves/ankles visible when possible, head-to-ankle long vertical body line, using head-to-body ratio, leg proportion, camera height, lens, composition and crop together to create the 167–170cm professional model visual impression; no chest-up big-head crop, no high-angle compression, no thigh-only crop。",
    "Environment Standard：same camera, same exposure, same light source, same color temperature, same shadow direction, same depth of field, natural contact shadow under feet/legs/body edges, environmental bounce reflection, background perspective aligned, subject naturally integrated into environment。",
    "Scene Realism Standard：real location details, correct perspective, environmental reflections, slight background imperfections, lived-in props, atmospheric depth; no CGI resort, no empty fake pool backdrop, no stock-photo background, no pasted subject, no cutout edge glow, no over-sharp subject pasted onto soft background。",
    "Scene Diversity Lock：do not reuse the same pool/hotel/beach background across images; this image must follow its own Scene Family and Scene Standard, with different architecture, prop, lighting time and camera distance from the other 5 images。",
    "Product Consistency：100% follow product reference images for clothing only; do not redesign color, pattern, silhouette, fabric, trims, opening/closure state or details; the cardigan front must remain open and unfastened with separated left/right front panels。",
    "Strict Ban：no face change, no body ratio drift, no short legs, no petite body, no big head, no 50/50 body ratio, no compressed body, no thigh crop, no knee-up crop, no half-body compression, no sitting, no kneeling, no squatting, no reclining, no folded legs, no high-angle shot that makes the model look short, no over-stretched body, no exaggerated tiny head, no mannequin-like body, no plastic skin, no cutout subject, no random clothes, no menwear, no sweatshirt, no knitwear, no unrelated dress, no added buttons, no added zipper, no button placket, no vertical button band, no central white strip, no tied knot, no closed front, no fastened cardigan, no closed V-neck blouse, no extra person, no readable text, no watermark, no logo, no brand text, no random signage letters。",
  ].join("\n");
}

function productFeatureList(product = {}) {
  const details = [
    ...(Array.isArray(product.selling_points) ? product.selling_points : []),
    ...(Array.isArray(product.key_details) ? product.key_details : []),
  ].filter(Boolean);
  const defaults = ["商品轮廓", "前襟/开口/闭合结构", "领口/肩部结构", "袖口/下摆", "图案/印花", "结构褶皱", "层叠/边缘", "关键装饰", "面料垂坠"];
  return Array.from(new Set([...details, ...defaults])).slice(0, 10);
}

function productDetailCellPlan(product = {}, features = []) {
  const candidates = productFeatureList(product).concat(features).filter(Boolean);
  const uniqueFeatures = Array.from(new Set(candidates)).slice(0, 8);
  const fallbackCells = ["前襟/开口/闭合结构近拍", "面料纹理近拍", "领口/肩部或袖口近拍", "层叠/边缘近拍", "下摆或装饰做工近拍"];
  const cells = fallbackCells.map((fallback, index) => uniqueFeatures[index] || fallback);
  return [
    `右侧小格 1=${cells[0]}`,
    `右侧小格 2=${cells[1]}`,
    `右侧小格 3=${cells[2]}`,
    `右侧小格 4=${cells[3]}`,
    `左下补图=${cells[4]}`,
    "五个小格互不重复且全部填满真实商品局部",
  ].join("；");
}

function publicVisualStandardLibrary() {
  return visualStandardLibrary;
}

async function generateOneImage({
  generatedAt,
  index,
  prompt,
  references,
  requestId,
  startedAt,
  type,
  writeEvent = () => {},
}) {
  const attempt = 1;
  writeEvent({ attempt, index, type: "image_start" });
  logStep(requestId, `seedream:${index + 1}:start`);

  const imageUrl = await generateSeedreamImage({
    prompt,
    references,
    type,
  });
  const elapsedSeconds = elapsedSince(startedAt);
  const result = {
    elapsedSeconds,
    generatedAt,
    index,
    prompt,
    referencesUsed: publicReferences(references),
    type,
    url: imageUrl,
  };

  logStep(requestId, `seedream:${index + 1}:done:${elapsedSeconds}s`);
  writeEvent({
    attempt,
    image: result,
    index,
    type: "image_done",
  });

  return result;
}

async function generateSeedreamImage({ prompt, references, type }) {
  const endpoint =
    process.env.SEEDDREAM_ENDPOINT || "https://ark.cn-beijing.volces.com/api/v3/images/generations";
  const body = buildSeedreamRequestBody({
    prompt,
    references,
    type,
  });

  const response = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.ARK_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`图片生成服务失败：${response.status} ${cleanProviderText(await response.text())}`);
  }

  const data = await response.json();
  const image = data.data?.[0] || {};
  if (image.url) return image.url;
  if (image.b64_json) return `data:image/png;base64,${image.b64_json}`;
  if (image.image_url) return image.image_url;
  throw new Error("图片生成服务未返回图片 URL 或 base64");
}

function buildSeedreamRequestBody({ prompt, references, type }) {
  const body = {
    model: process.env.ARK_IMAGE_MODEL || process.env.SEEDDREAM_MODEL || "doubao-seedream-5-0-260128",
    output_format: process.env.SEEDDREAM_RESPONSE_FORMAT || "png",
    prompt: `${referenceMapText(references)}\n出图类型：${type}\n最高优先级商品结构硬锁：${garmentClosureStructureLock}\n开衫错误修正：宁可让前襟开口更大，也绝不能生成扣上/系上/闭合/中心扣条/白色闭合竖线/一排扣。\n${prompt}`,
    size: normalizeSeedreamSize(process.env.SEEDDREAM_IMAGE_SIZE || "2k"),
    watermark: false,
  };

  if (shouldUseReferenceImages() && references.length > 0) {
    body[process.env.SEEDDREAM_REFERENCE_FIELD || "image"] = references.map((reference) => reference.url);
  }

  return body;
}

function normalizeSeedreamSize(value) {
  const size = String(value || "").trim();
  if (!size) return "2k";
  if (/^1k$/i.test(size)) return "1728x2304";
  if (/^[234]k$/i.test(size)) return size.toLowerCase();
  if (/^\d+x\d+$/i.test(size)) return size.toLowerCase();
  return "1728x2304";
}

async function callArkChat(payload, timeoutMs = arkTimeoutMs) {
  const response = await fetchWithTimeout(chatEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.ARK_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  }, timeoutMs);

  if (!response.ok) {
    throw new Error(`AI 服务调用失败：${response.status} ${cleanProviderText(await response.text())}`);
  }

  return response.json();
}

async function fetchWithTimeout(url, options, timeoutMs = arkTimeoutMs) {
  const timeoutValue = Number(timeoutMs);
  if (!Number.isFinite(timeoutValue) || timeoutValue <= 0) {
    return fetch(url, options);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutValue);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`AI 服务调用超时：${Math.round(timeoutValue / 1000)} 秒未返回`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function buildReferenceImages(images) {
  return [
    ["front", "商品正面"],
    ["back", "商品反面"],
    ["side", "侧面/细节"],
    ["face", "模特"],
  ]
    .map(([slot, label]) => {
      const image = images[slot];
      if (!image?.dataUrl) return null;
      return {
        label,
        name: image.name || label,
        slot,
        url: image.dataUrl,
      };
    })
    .filter(Boolean);
}

function referencesForImageType(references, type, index) {
  if (isProductDetailImage(type, index)) {
    return references.filter((reference) => reference.slot !== "face");
  }
  return references;
}

function isProductDetailImage(type, index) {
  return index === 4 || String(type || "").includes("细节");
}

function publicReferences(references) {
  return references.map((reference, index) => ({
    index: index + 1,
    label: reference.label,
    name: reference.name,
    role: reference.slot === "face" ? "model_identity" : "product_clothing",
    slot: reference.slot,
  }));
}

function referenceMapText(references) {
  if (!shouldUseReferenceImages() || references.length === 0) {
    return "当前未启用参考图模式。";
  }

  return [
    "参考图绑定：",
    ...references.map((reference, index) => {
      const role =
        reference.slot === "face"
          ? "仅用于模特人脸、发型、五官比例、人物身份，不继承衣服和背景"
          : "仅用于商品衣服颜色、版型、图案、材质、结构和细节；如果商品图里有人脸，只看脖子以下衣服，完全忽略商品图人物脸，不继承图中人物身份";
      return `参考图${index + 1}=${reference.label}，${role}`;
    }),
  ].join("\n");
}

function shouldUseReferenceImages() {
  return process.env.REFERENCE_IMAGE_MODE !== "false";
}

function normalizeAnalysisMode(value) {
  return "reference";
}

function normalizeProductAnalysis(value) {
  return {
    category: stringOrDefault(value?.category, "服装/泳衣"),
    color: stringOrDefault(value?.color, "以商品参考图为准"),
    key_details: Array.isArray(value?.key_details) ? value.key_details.slice(0, 8) : ["以商品参考图细节为准"],
    material: stringOrDefault(value?.material, "以商品参考图为准"),
    model: {
      face: stringOrDefault(value?.model?.face, "以模特参考图为准"),
      hair: stringOrDefault(value?.model?.hair, "以模特参考图为准"),
      vibe: stringOrDefault(value?.model?.vibe, "自然真实"),
    },
    pattern: stringOrDefault(value?.pattern, "以商品参考图为准"),
    selling_points: normalizeStringArray(value?.selling_points || value?.sellingPoints),
    silhouette: stringOrDefault(value?.silhouette, "以商品参考图为准"),
    style: stringOrDefault(value?.style, "电商场景氛围"),
  };
}

function defaultProductAnalysis(mode) {
  return {
    ...normalizeProductAnalysis({}),
    mode,
  };
}

function defaultGenerationAnalysis(mode) {
  return {
    model_analysis: {
      body: "以模特参考图为准",
      face: "以模特参考图为准",
      hair: "以模特参考图为准",
      vibe: "自然真实日系电商模特",
    },
    product_analysis: defaultProductAnalysis(mode),
  };
}

function analysisText(analysis) {
  return `不做颜色、材质、纹理、图案或品类推断；商品颜色、图案、版型、材质、边缘、装饰、前襟/开口/闭合结构和所有细节只以商品参考图实际画面为准；${garmentClosureStructureLock}模特脸和发型只以模特参考图为准。`;
}

function productOnlyAnalysisText(analysis) {
  return `不做颜色、材质、纹理、图案或品类推断；商品颜色、图案、版型、材质、边缘、装饰、前襟/开口/闭合结构和所有细节只以商品参考图实际画面为准；${garmentClosureStructureLock}`;
}

function withReferencePromptRules(plan) {
  const normalized = normalizePlan(plan);
  normalized.prompts = normalized.prompts.map((prompt, index) => {
    const referenceRule = index === 4
      ? "参考图规则：商品参考图只用于商品一致性；本张不使用模特身份，不需要人物出镜。"
      : "参考图规则：商品参考图只用于衣服一致性，模特参考图只用于人脸身份一致性。";
    const banRule = index === 4
      ? "严禁出现人物、模特、人脸、人体、手、穿着展示；严禁生成其他商品、随机花纹、文字、水印、Logo、畸变。"
      : "严禁换脸，严禁换衣服，严禁生成男装、卫衣、针织衫、随机裙装或其他商品。";
    return [
      referenceRule,
      banRule,
      `服装结构硬锁：${garmentClosureStructureLock}`,
      globalVisualStandardPrompt(index),
      promptGuardForIndex(index, normalized.directorPlan?.[index]),
      prompt || fallbackPrompt(index, normalized.product_analysis),
    ].join("\n");
  });
  return normalized;
}

function globalVisualStandardPrompt(index) {
  if (index === 4) {
    return [
      "SHEIN 日本站细节图标准：纯商品展示，左大右小主次宫格，清爽真实，转化导向，主次分明。",
      `服装结构硬锁：${garmentClosureStructureLock}`,
      productDetailLayoutStandard,
      productDetailFullViewGuard,
      productDetailSmallCellsGuard,
      `摄影标准：商品平铺或悬挂商品摄影，清晰电商详情页主次宫格，自然软光，真实材质纹理，correct gravity，natural fabric drape；${productDetailBan}`,
    ].join("\n");
  }

  return [
    "AI Visual Director 系列标准：同一模特、同一拍摄系列、同一摄影语言，只变化场景、动作和机位。",
    "Identity Lock：Same Person, Same Face, Same Hair, Same Makeup, Same Skin Tone, Same Height Visual Impression, Same Body Ratio, Same Photographer。",
    `Height Visual Standard：${personTallModelVisualStandard}`,
    `Tall Body Hard Lock：${tallPoseHardLock}`,
    `Garment Closure Hard Lock：${garmentClosureStructureLock}`,
    "Model Standard：真实商业模特比例，167–170cm 职业模特的视觉观感，不是实际身高描述，只是出图视觉比例标准；自然高挑感，自然连续长腿但人体比例可信，腰线偏高，自然肩/腰/臀，允许轻微姿态不完美，六张身体比例稳定；禁止头大、腿短、五五身、身材压缩、显矮、大腿中部截断、膝上截断、胸口以上大头构图、高机位俯拍、坐姿压缩、跪姿压缩、蹲姿、躺姿、过度拉伸、夸张小头超长腿和假人比例。",
    "Human Anatomy Guard：2 hands, 2 arms, 2 legs, 2 eyes, natural fingers, no extra limbs, no third hand, no fused hands。",
    "Face Realism Standard：同一张脸，真实皮肤纹理，可见毛孔，轻微不对称，细小瑕疵，柔和眼下纹理，自然法令纹和唇纹，自然眼神，自然日系商业妆容。",
    "Anti-AI Face Ban：禁止 AI 美颜脸、塑料皮肤、蜡感皮肤、过亮大眼、完美对称、网红滤镜脸、动漫感、过度磨皮、过度锐化。",
    "Photography Standard：50mm lens，commercial fashion photography，editorial but realistic，日本电商清爽色温，soft shadow，bounce light，自然透视和可信摄影构图；通过头身比、腿部比例、机位、镜头、构图和裁切共同控制显高比例；相机高度在胯部到腰部，轻微低机位但不夸张拉伸，人物占画面高度约 86%-94%，必须全身或脚踝以上近全身，头顶到脚踝/脚面形成完整纵向线条，脚踝/小腿尽量入镜，避免胸口以上大头构图、高机位压矮和只露大腿的裁切。",
    "Environment Standard：人物与背景像同一台相机同一时间拍摄，同光源、同曝光、同色温、同阴影方向、同景深；脚下/腿部/身体边缘有自然接触阴影、环境反光和轻微空气透视，背景透视一致，subject naturally integrated into environment。",
    "Scene Realism Standard：真实地点细节、环境反射、轻微背景瑕疵、生活化道具、空气透视；禁止 CGI 度假村、空洞假泳池背景、图库感背景、抠图感、人物边缘发光、主体过锐贴在柔背景上。",
    `Reference Style Learning：${visualStandardLibrary.referenceStyleLibrary.mood}；场景胶囊池=${visualStandardLibrary.referenceStyleLibrary.scenes.join("、")}；本张只执行当前 Scene，不要默认回到泳池/海景阳台。`,
    `Prop Rule：每张最多 1-2 个生活道具，可选 ${visualStandardLibrary.referenceStyleLibrary.props.join("、")}；道具必须自然入镜，不能遮挡商品卖点。`,
    `Text/Watermark Ban：${visualStandardLibrary.referenceStyleLibrary.textBan}。`,
    "Scene Diversity Lock：6 张不能复用同一个泳池/酒店/海边背景；人物图尽量覆盖不同场景家族，如 studio/window、indoor room、cafe/street、garden、marina/ocean、pool/beach；每张必须有不同地点类别、建筑元素、道具、光线时间和景深。",
    "商品卖点露出：动作不能挡住核心卖点；必须露出商品参考图中的正面轮廓、领口、前襟/开口/闭合结构、袖口/下摆、面料纹理、图案/装饰和真实垂坠；开衫/不可扣合款必须保持前襟敞开，左右前片分离，胸前到下摆有连续开口；手碰衣边时只能向外分开展示，不能把衣片合到一起。",
    "Fabric Standard：natural fabric tension，correct gravity，real fabric drape，裙摆和褶皱符合真实重力。",
  ].join("\n");
}

function promptGuardForIndex(index, director) {
  if (director && index !== 4) {
    const actionDiversityRule = index === 2
      ? "图三稳定优先：不要行走大跨步、奔跑、坐姿、跪姿、跳跃、手机自拍或复杂互动；少道具或无道具，避免手持饮品/包/草帽遮挡商品；同一套图里图三负责稳定轻生活展示，不负责高动态。"
      : "本轮动作去重：不要重复上一张的主动作、手部互动和主道具；同一套图用正面站姿、侧身/回头站姿、轻靠站姿、封面站姿形成分散感，不能用坐姿/跪姿/蹲姿来制造差异。";
    return [
      `本张为${imageTypes[index]}：必须执行本轮动态导演方案，不要回到固定泳池/阳台/礁石模板。`,
      `Scene Family：${director.sceneFamily || "lifestyle"}。`,
      `Scene：${Array.isArray(director.environment) ? director.environment.join(" / ") : director.sceneCategory || "dynamic ecommerce scene"}。`,
      `Pose Source：${director.source || "style-pool"}；Pose=${director.pose || "natural pose"}。`,
      `Body Orientation：${director.bodyOrientation || "natural"}；Hand Placement：${director.handPlacement || "natural hands"}；Leg Pose：${director.legPose || "natural long-leg pose"}；Prop Interaction：${director.propInteraction || "none"}。`,
      `Tall Body Hard Lock：${tallPoseHardLock}`,
      `Visibility Guard：${director.visibilityGuard || "动作不能遮挡商品卖点，领口、前襟/开口/闭合结构、袖口、下摆和图案必须清晰；左右前片必须分开，不能出现扣条或中心闭合竖线。"}。`,
      actionDiversityRule,
    ].join("\n");
  }

  const guards = [
    `本张为主图：使用本轮动态抽样的真实电商场景，低遮挡正面或微侧站姿，胯腰高度轻微低机位，全身或脚踝以上近全身，脚踝/小腿尽量入镜，商品正面卖点无遮挡；领口、前襟/开口/闭合结构、袖口和下摆必须清楚；开衫左右前片必须分开，胸前到下摆有连续开口，绝不能出现扣条或中心白色闭合竖线。${garmentClosureStructureLock}${tallPoseHardLock}`,
    `本张为侧身/背面版型图：使用本轮动态抽样的侧身、背面或回头站姿，展示背面/侧面轮廓、肩线、袖长、前襟边缘状态和下摆；避免大腿中部截断、膝上截断和半身压缩，保持真实商业模特比例。${garmentClosureStructureLock}${tallPoseHardLock}`,
    `本张为生活场景图：稳定轻生活展示，优先咖啡店门口、窗边、码头栏杆、花园小径等简单真实场景；正面或微侧站姿，低动作、少道具或无道具，双手自然下垂或轻触衣摆边缘但不能把前片合拢；全身或脚踝以上近全身，小腿/脚踝尽量完整，人体比例可信，商品卖点无遮挡；禁止行走大跨步、手持饮品/包/草帽遮挡、坐姿、跪姿、蹲姿、躺姿和复杂互动。${garmentClosureStructureLock}${tallPoseHardLock}`,
    `本张为氛围场景图：使用本轮动态抽样的光影、情绪和环境融合场景，只允许站姿、微侧站姿、回头站姿或轻靠站姿；可扶头发、拿墨镜、靠栏杆或自然回头；商品主体仍清楚，避免胸口以上大头构图、坐姿、跪姿、蹲姿、躺姿和半身压缩。${garmentClosureStructureLock}${tallPoseHardLock}`,
    `本张为商品细节卖点图：纯商品左大右小主次宫格，不出现模特、不出现人脸、不出现人体、不出现手；${garmentClosureStructureLock}${productDetailLayoutStandard}${productDetailFullViewGuard}${productDetailSmallCellsGuard}${productDetailSmallCellsNoRepeatGuard}${productDetailBan}`,
    `本张为种草封面图：使用本轮动态抽样的封面场景、封面动作和主道具，必须站姿近全身，整理头发、轻触衣摆边缘但不能合拢前片、hold bag low 或自然笑；不做普通半身、坐姿、跪姿、蹲姿、躺姿压矮构图。${garmentClosureStructureLock}${tallPoseHardLock}`,
  ];
  return guards[index] || "";
}

function stringOrDefault(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function elapsedSince(startedAt) {
  return Number(((Date.now() - startedAt) / 1000).toFixed(1));
}

function logStep(requestId, step) {
  console.log(`[${new Date().toISOString()}] ${requestId} ${step}`);
}

function imageContent(url) {
  return {
    image_url: { url },
    type: "image_url",
  };
}

function normalizePlan(plan) {
  const normalized = plan && typeof plan === "object" ? plan : {};
  normalized.scenes = Array.isArray(normalized.scenes) ? normalized.scenes.slice(0, 6) : [];
  normalized.prompts = Array.isArray(normalized.prompts) ? normalized.prompts.slice(0, 6) : [];

  while (normalized.scenes.length < 6) {
    const index = normalized.scenes.length;
    normalized.scenes.push({ title: imageTypes[index] });
  }

  while (normalized.prompts.length < 6) {
    normalized.prompts.push(fallbackPrompt(normalized.prompts.length));
  }

  normalized.scenes = normalized.scenes.map((scene, index) => ({
    ...(scene && typeof scene === "object" ? scene : {}),
    title: imageTypes[index],
  }));

  return normalized;
}

function fallbackPrompt(index, analysis = defaultProductAnalysis("fallback")) {
  const scenes = [
    "日系清爽棚拍、白墙 showroom 或民宿窗边自然光正面穿搭，模特自然站姿，全身或脚踝以上近全身，人物占画面高度 86%-94%，头顶到脚踝/脚面形成完整纵向线条，突出商品正面轮廓和上身效果；开衫左右前片必须分开，胸前到下摆有连续开口，不能出现扣条/中心闭合竖线，同时保持真实商业模特比例",
    "日系侧身或背面版型展示，优先使用窗边白帘、白色走廊、花园门廊或海景阳台其中一个场景，模特微转身体，站姿回头，全身或脚踝以上近全身，人物占画面高度 86%-94%，强调背面/侧面轮廓、肩线、袖长、前襟边缘状态和下摆，避免大腿中部截断、膝上截断和半身压缩",
    "日本夏日稳定轻生活场景，从海边小镇咖啡店门口、饮品店窗边、花园石径旁、码头栏杆旁、民宿窗边中任选一个，不固定泳池/露台，自然阳光；正面或微侧站姿，低动作、少道具或无道具，双手自然下垂或轻触衣摆边缘但不能合拢前片；全身或脚踝以上近全身，人物占画面高度 86%-94%，真实生活方式氛围，自然全身比例，禁止行走大跨步、坐姿、跪姿、蹲姿、躺姿、手持饮品/包/草帽遮挡商品",
    "日系氛围场景图，从日落码头、风吹白帘室内、花墙门廊、礁石远景、棕榈花园中任选一个，站姿、微侧站姿、回头站姿或轻靠站姿近全身，人物占画面高度 86%-94%，强调光影、环境情绪和种草感，避免胸口以上大头构图、坐姿、跪姿、蹲姿、躺姿和半身压缩，商品领口、前襟/开口/闭合结构、袖口和下摆保持参考图状态",
    `纯商品左大右小主次宫格卖点图，无人物、无人脸、无手、无身体；${garmentClosureStructureLock}${productDetailLayoutStandard}${productDetailFullViewGuard}${productDetailSmallCellsGuard}`,
    "SNS/电商封面图，适合 Rakuten、Qoo10、Instagram 种草封面，必须站姿近全身，人物占画面高度 86%-94%，场景从花园门廊、海边咖啡露台、码头栏杆、白色更衣帘、阳光民宿房间中任选一个，开衫必须敞开且左右前片分离，画面清透有记忆点，禁止坐姿、跪姿、蹲姿、躺姿和半身压缩",
  ];

  if (index === 4) {
    return [
      "参考图规则：商品参考图只用于商品一致性；本张不使用模特身份，不需要人物出镜。",
      "SHEIN 日本站细节图标准：纯商品展示，左大右小主次宫格，清爽真实，转化导向，主次分明。",
      `服装结构硬锁：${garmentClosureStructureLock}`,
      productDetailLayoutStandard,
      productDetailFullViewGuard,
      productDetailSmallCellsGuard,
      `摄影标准：商品平铺或悬挂商品摄影，清晰电商详情页主次宫格，自然软光，真实材质纹理，correct gravity，natural fabric drape；${productDetailBan}`,
      "严禁生成其他商品、随机花纹、文字、水印、Logo、畸变。",
      `商品参考图规则：${productOnlyAnalysisText(analysis)}。`,
      `${scenes[index]}，3:4 竖版构图，高清真实商业摄影，自然光，画面干净，无畸变，无多余文字，无水印。`,
    ].join("\n");
  }

  return [
    "参考图规则：商品参考图只用于衣服，模特参考图只用于同一张脸和人物身份。",
    "必须保持商品颜色、版型、图案、材质、边缘、前襟/开口/闭合结构和关键细节一致；必须保持模特脸、发型、五官比例和气质一致。",
    `服装结构硬锁：${garmentClosureStructureLock}`,
    "开衫画面优先级：宁可让前襟打开得更明显，也不能画成扣上、系上、闭合、单排扣、中心扣条或白色闭合竖线。",
    personTallModelVisualStandard,
    tallPoseHardLock,
    "人物图必须保持真实商业模特比例、自然高挑感、自然连续长腿但人体比例可信；相机胯腰高度轻微低机位但不夸张拉伸，人物占画面高度约 86%-94%，必须全身或脚踝以上近全身，脚踝/小腿尽量入镜，禁止只露大腿。",
    "真人质感必须真实：保留皮肤纹理、自然眼神、轻微不对称、自然法令纹和唇纹；严禁 AI 偶像脸、塑料皮肤、蜡感皮肤、过度磨皮、过亮眼睛和过度锐化。",
    "人物与背景必须同一相机、同一曝光、同色温、同阴影方向、同景深；脚下/腿部/身体边缘必须有自然接触阴影和环境反光；严禁人物边缘发光、主体过锐、图库背景和抠图贴图感。",
    "场景多样性：同一套 6 张不要反复使用泳池、海边、酒店阳台；人物图要尽量分散到棚拍/窗边、室内民宿、咖啡街景、花园、码头/海景、泳池/沙滩等不同家族。",
    "严禁生成其他人脸、其他衣服、男装、卫衣、针织衫、随机裙装或其他商品；严禁头大、腿短、五五身、身材压缩、显矮、大腿中部截断、膝上截断、胸口以上大头构图、高机位俯拍、坐姿压缩、跪姿压缩、蹲姿、躺姿、过度拉伸、夸张小头超长腿和假人比例。",
    `商品参考图规则：${analysisText(analysis)}。`,
    `${scenes[index]}，3:4 竖版构图，高清真实商业摄影，自然光，画面干净，无畸变，无多余文字，无水印。`,
  ].join("\n");
}

function parseJsonBlock(text) {
  if (typeof text !== "string") return {};
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fenced?.[1] || trimmed;
  try {
    return JSON.parse(jsonText);
  } catch {
    const arrayStart = jsonText.indexOf("[");
    const arrayEnd = jsonText.lastIndexOf("]");
    if (arrayStart >= 0 && arrayEnd > arrayStart) {
      try {
        return JSON.parse(jsonText.slice(arrayStart, arrayEnd + 1));
      } catch {
        // Continue with object extraction.
      }
    }
    const start = jsonText.indexOf("{");
    const end = jsonText.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(jsonText.slice(start, end + 1));
      } catch {
        return {};
      }
    }
    return {};
  }
}

function cleanProviderText(message) {
  return String(message || "")
    .replace(/Doubao/gi, "AI")
    .replace(/豆包/g, "AI")
    .replace(/Seedream/gi, "图片生成服务")
    .replace(/Ark/gi, "AI 服务")
    .trim();
}

function formatGeneratedTime(date) {
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function createExportZip(record) {
  const safeRecord = record && typeof record === "object" ? record : {};
  const images = Array.isArray(safeRecord.images) ? safeRecord.images.filter((image) => image?.url) : [];
  const files = [
    {
      data: Buffer.from(JSON.stringify(safeRecord, null, 2), "utf8"),
      name: "record.json",
    },
  ];

  await Promise.all(
    images.map(async (image, index) => {
      const data = await readImageForExport(image.url);
      const extension = extensionForImageExport(image.url, data.contentType);
      files.push({
        data: data.buffer,
        name: `images/${String(image.index ?? index + 1).padStart(2, "0")}-${safeFilename(image.type || imageTypes[index] || "image")}.${extension}`,
      });
    })
  );

  return {
    buffer: createZip(files),
    filename: `ai-agent-export-${Date.now()}.zip`,
  };
}

async function readImageForExport(url) {
  if (typeof url !== "string") {
    throw new Error("导出失败：图片 URL 无效");
  }

  if (url.startsWith("data:")) {
    const match = url.match(/^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.*)$/);
    if (match) {
      return {
        buffer: Buffer.from(match[2], "base64"),
        contentType: match[1] || "application/octet-stream",
      };
    }

    const comma = url.indexOf(",");
    if (comma > -1) {
      const header = url.slice(0, comma);
      return {
        buffer: Buffer.from(decodeURIComponent(url.slice(comma + 1))),
        contentType: header.match(/^data:([^;,]+)/)?.[1] || "application/octet-stream",
      };
    }
  }

  const response = await fetchWithTimeout(url, {}, arkTimeoutMs);
  if (!response.ok) {
    throw new Error(`导出失败：图片下载失败 ${response.status}`);
  }

  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") || "",
  };
}

function createZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { date, time } = zipDateTime(new Date());

  files.forEach((file) => {
    const name = Buffer.from(file.name, "utf8");
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + data.length;
  });

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, end]);
}

function zipDateTime(dateValue) {
  const year = Math.max(1980, dateValue.getFullYear());
  return {
    date: ((year - 1980) << 9) | ((dateValue.getMonth() + 1) << 5) | dateValue.getDate(),
    time: (dateValue.getHours() << 11) | (dateValue.getMinutes() << 5) | Math.floor(dateValue.getSeconds() / 2),
  };
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function extensionForImageExport(url, contentType = "") {
  if (contentType.includes("jpeg")) return "jpg";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("svg")) return "svg";
  if (contentType.includes("png")) return "png";
  const cleanUrl = String(url).split("?")[0].toLowerCase();
  if (cleanUrl.endsWith(".jpg") || cleanUrl.endsWith(".jpeg")) return "jpg";
  if (cleanUrl.endsWith(".webp")) return "webp";
  if (cleanUrl.endsWith(".svg")) return "svg";
  return "png";
}

function safeFilename(value) {
  return String(value || "image")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 48);
}

function readJson(req, limit = 30 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > limit) {
        reject(new Error("请求体过大"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("JSON 解析失败"));
      }
    });
    req.on("error", reject);
  });
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, `http://127.0.0.1:${port}`).pathname);
  const filePath = path.join(rootDir, urlPath === "/" ? "index.html" : urlPath);

  if (path.relative(rootDir, filePath).startsWith("..")) {
    sendText(res, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendText(res, 404, "Not Found");
      return;
    }

    res.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": contentType(filePath),
    });
    res.end(data);
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function contentType(filePath) {
  const ext = path.extname(filePath);
  return (
    {
      ".css": "text/css; charset=utf-8",
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".svg": "image/svg+xml",
      ".webp": "image/webp",
    }[ext] || "application/octet-stream"
  );
}

function loadEnv(filePath, options = {}) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (options.override || !(key in process.env)) {
      process.env[key] = value.replace(/^["']|["']$/g, "");
    }
  }
}
