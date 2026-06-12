// Body Bright illustration generator.
//
// Draws every exercise illustration as SVG in one consistent style and
// renders each to a 1024x1024 transparent PNG in public/images/, named by
// exercise id so any image can later be replaced by a same-named file.
//
// Style (Illustration Style Specification v1, adapted to the app's dark
// neon aesthetic): simplified recognisably-human figure, clean cyan
// linework, translucent cyan fills, hair tied back, minimal secondary
// objects, no backgrounds or scenery.
//
// Run: node scripts/generate-illustrations.mjs   (requires sharp installed)

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const OUT_DIR = path.resolve("public/images");
const SIZE = 1024;

// ── Palette ──────────────────────────────────────────────────────────────
const LINE = "#bdf3ee"; // pale aqua-cyan linework
const FILL = "rgba(24, 223, 240, 0.14)"; // translucent body fill
const HAIR = "rgba(24, 223, 240, 0.34)"; // hair fill
const OBJ = "#62aeb9"; // dimmer object linework
const OBJ_FILL = "rgba(98, 174, 185, 0.10)";
const CUE = "#8feadd"; // subtle motion-cue arcs

const LIMB_W = 32; // limb stroke width
const OUTLINE_W = 9; // outline width on filled shapes
const OBJ_W = 13; // object stroke width

// ── Primitive helpers (return SVG fragments) ─────────────────────────────

function limb(points, w = LIMB_W, color = LINE) {
  const d =
    `M ${points[0][0]} ${points[0][1]} ` +
    points.slice(1).map(([x, y]) => `L ${x} ${y}`).join(" ");
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function shape(d) {
  return `<path d="${d}" fill="${FILL}" stroke="${LINE}" stroke-width="${OUTLINE_W}" stroke-linejoin="round"/>`;
}

// Rounded capsule between two points — used for leaning/horizontal torsos.
function capsule(x1, y1, x2, y2, r) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * r;
  const ny = (dx / len) * r;
  return (
    `M ${x1 + nx} ${y1 + ny} L ${x2 + nx} ${y2 + ny} ` +
    `A ${r} ${r} 0 0 1 ${x2 - nx} ${y2 - ny} ` +
    `L ${x1 - nx} ${y1 - ny} A ${r} ${r} 0 0 1 ${x1 + nx} ${y1 + ny} Z`
  );
}

function obj(d, w = OBJ_W) {
  return `<path d="${d}" fill="none" stroke="${OBJ}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function objShape(d) {
  return `<path d="${d}" fill="${OBJ_FILL}" stroke="${OBJ}" stroke-width="${OBJ_W}" stroke-linejoin="round"/>`;
}

function cue(d) {
  return `<path d="${d}" fill="none" stroke="${CUE}" stroke-width="8" stroke-linecap="round" opacity="0.75"/>`;
}

function polar(cx, cy, r, deg) {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy - r * Math.sin(rad)];
}

// Head with hair cap and low bun. facing: front | left | right.
function head(cx, cy, { r = 46, facing = "front", tilt = 0 } = {}) {
  const capOuter = r * 1.05;
  const capInner = r * 0.62;
  const [ox1, oy1] = polar(cx, cy, capOuter, 165);
  const [ox2, oy2] = polar(cx, cy, capOuter, 15);
  const [ix1, iy1] = polar(cx, cy, capInner, 15);
  const [ix2, iy2] = polar(cx, cy, capInner, 165);

  const bunAngle = facing === "right" ? 155 : facing === "left" ? 25 : 115;
  const [bx, by] = polar(cx, cy, r * 1.12, bunAngle);

  return (
    `<g transform="rotate(${tilt} ${cx} ${cy})">` +
    `<circle cx="${bx}" cy="${by}" r="17" fill="${HAIR}" stroke="${LINE}" stroke-width="6"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${FILL}" stroke="${LINE}" stroke-width="${OUTLINE_W}"/>` +
    `<path d="M ${ox1} ${oy1} A ${capOuter} ${capOuter} 0 0 1 ${ox2} ${oy2} L ${ix1} ${iy1} A ${capInner} ${capInner} 0 0 0 ${ix2} ${iy2} Z" fill="${HAIR}"/>` +
    `</g>`
  );
}

function foot(ax, ay, dir = 1, len = 56) {
  return limb([[ax, ay], [ax + dir * len, ay]], 24);
}

// Upright front-view torso (shoulders → hips with a slight waist).
function frontTorso(cx, shoulderY, hipY, shoulderHalf = 78, hipHalf = 56) {
  return shape(
    `M ${cx - shoulderHalf} ${shoulderY} Q ${cx} ${shoulderY - 24} ${cx + shoulderHalf} ${shoulderY} ` +
      `L ${cx + hipHalf} ${hipY} Q ${cx} ${hipY + 18} ${cx - hipHalf} ${hipY} Z`
  );
}

function neck(cx, headCy, shoulderY, r = 46) {
  return limb([[cx, headCy + r - 6], [cx, shoulderY + 6]], 24);
}

// ── Poses ────────────────────────────────────────────────────────────────
// Canvas 1024x1024, ground ≈ y 850, standing figure ≈ 63% of height.

const poses = {};

// Walking, side view facing right. Shared by walk_1/2/3.
function walkPose() {
  return [
    // back arm behind torso
    limb([[505, 365], [435, 455], [405, 545]]),
    // back leg, heel lifting
    limb([[495, 550], [432, 695], [372, 818]]),
    limb([[372, 818], [420, 836]], 24),
    shape(capsule(510, 555, 540, 360, 62)),
    neck(546, 268, 348),
    head(550, 264, { facing: "right" }),
    // front leg striding forward
    limb([[520, 550], [592, 690], [618, 832]]),
    foot(618, 832, 1),
    // front arm swinging forward
    limb([[545, 365], [622, 448], [668, 520]]),
  ];
}
poses.walk_1 = walkPose;
poses.walk_2 = walkPose;
poses.walk_3 = walkPose;

poses.gardening = () => [
  // small plant in a pot
  objShape("M 690 790 L 770 790 L 756 850 L 704 850 Z"),
  obj("M 730 790 L 730 720"),
  obj("M 730 740 Q 690 720 680 685"),
  obj("M 730 730 Q 770 712 782 678"),
  // kneeling figure facing right
  limb([[438, 630], [392, 800], [300, 812]]), // kneeling back leg
  foot(300, 822, -1, 44),
  limb([[455, 635], [560, 688], [556, 812]]), // front leg, foot flat
  foot(556, 812, 1, 50),
  shape(capsule(440, 622, 478, 432, 60)),
  neck(486, 330, 428),
  head(490, 326, { facing: "right" }),
  // resting arm down onto front knee
  limb([[462, 452], [488, 555], [540, 648]]),
  // working arm reaching forward with trowel
  limb([[492, 442], [580, 505], [622, 592]]),
  obj("M 624 600 L 664 652"),
  objShape("M 650 640 L 690 676 L 656 692 Z"),
];

poses.stair_climbing = () => [
  // three rising steps
  obj(
    "M 540 850 L 660 850 L 660 770 L 780 770 L 780 690 L 900 690 L 900 610"
  ),
  // figure climbing, side view facing right
  limb([[468, 558], [452, 700], [448, 838]]), // standing leg on floor
  foot(448, 838, 1),
  shape(capsule(465, 560, 492, 365, 60)),
  neck(498, 258, 360),
  head(502, 254, { facing: "right" }),
  limb([[492, 560], [592, 632], [612, 762]]), // leading leg onto step
  foot(612, 762, 1, 50),
  limb([[462, 372], [400, 455], [378, 540]]), // back arm
  limb([[498, 372], [575, 445], [628, 505]]), // front arm
];

poses.marching_on_spot = () => [
  limb([[484, 548], [478, 700], [476, 838]]), // standing leg
  foot(476, 838, -1),
  frontTorso(512, 350, 548),
  neck(512, 252, 346),
  head(512, 248),
  limb([[540, 548], [592, 638], [580, 758]]), // raised knee
  foot(580, 758, 1, 46),
  limb([[446, 360], [420, 460], [448, 548]]), // arm down
  limb([[578, 360], [646, 432], [690, 366]]), // arm pumping, forearm up
  cue("M 660 620 A 60 60 0 0 0 668 560"),
];

poses.counter_pushups = () => [
  // kitchen counter
  obj("M 150 555 L 380 555"),
  obj("M 185 555 L 185 850"),
  obj("M 345 555 L 345 850"),
  // leaning figure facing left
  limb([[640, 648], [676, 745], [704, 838]]), // back leg
  foot(704, 838, 1, 48),
  limb([[622, 640], [652, 740], [676, 836]]), // near leg
  shape(capsule(628, 636, 496, 478, 60)),
  neck(452, 408, 470, 44),
  head(440, 396, { facing: "left", tilt: -18 }),
  limb([[490, 482], [415, 528], [358, 552]]), // arms to counter
  limb([[502, 494], [432, 542], [372, 562]]),
];

poses.wall_pushups = () => [
  // wall
  obj("M 300 300 L 300 850", 16),
  // leaning figure facing left, shallower lean than counter pushups
  limb([[600, 642], [626, 742], [648, 838]]),
  foot(648, 838, 1, 48),
  limb([[584, 636], [608, 738], [628, 836]]),
  shape(capsule(590, 630, 502, 458, 60)),
  neck(462, 392, 452, 44),
  head(452, 380, { facing: "left", tilt: -14 }),
  limb([[496, 462], [410, 472], [318, 462]]), // arms to wall
  limb([[506, 476], [422, 488], [318, 486]]),
];

poses.sit_to_stand = () => [
  // chair facing left
  obj("M 560 640 L 750 640"), // seat
  obj("M 745 640 L 745 415"), // back
  obj("M 585 640 L 585 850"),
  obj("M 725 640 L 725 850"),
  // figure rising, facing left
  limb([[548, 600], [478, 700], [470, 838]]),
  foot(470, 838, -1, 50),
  limb([[562, 608], [496, 706], [490, 840]]),
  shape(capsule(552, 600, 470, 462, 58)),
  neck(432, 392, 455, 44),
  head(424, 382, { facing: "left", tilt: -10 }),
  limb([[465, 470], [385, 520], [318, 548]]), // arms reaching forward
  limb([[475, 482], [398, 534], [330, 562]]),
];

poses.calf_raises = () => [
  // rising onto toes, side view facing right; heels lifted
  limb([[492, 552], [486, 700], [482, 800]]), // legs together
  limb([[510, 552], [506, 700], [502, 798]]),
  limb([[482, 800], [524, 836]], 24), // feet on tiptoe
  limb([[502, 798], [546, 834]], 24),
  shape(capsule(498, 552, 510, 358, 60)),
  neck(514, 250, 352),
  head(518, 246, { facing: "right" }),
  limb([[488, 366], [462, 462], [468, 552]]), // arms relaxed
  limb([[532, 366], [552, 460], [540, 550]]),
  cue("M 596 812 A 40 40 0 0 0 588 754"), // heel-lift cue
];

poses.mini_squats = () => [
  // shallow squat, side view facing right, hips back, arms forward
  limb([[472, 588], [532, 686], [514, 830]]),
  foot(514, 830, 1),
  limb([[455, 582], [515, 682], [497, 828]]),
  shape(capsule(468, 582, 525, 408, 60)),
  neck(536, 304, 400, 44),
  head(542, 298, { facing: "right", tilt: 8 }),
  limb([[528, 415], [620, 428], [692, 432]]), // arms straight forward
  limb([[522, 432], [612, 446], [684, 450]]),
];

poses.step_ups = () => [
  // step block
  objShape("M 575 760 L 810 760 L 810 850 L 575 850 Z"),
  // figure stepping up, facing right
  limb([[508, 562], [498, 702], [494, 838]]), // standing leg
  foot(494, 838, 1, 48),
  shape(capsule(512, 560, 528, 366, 60)),
  neck(534, 262, 360),
  head(538, 258, { facing: "right" }),
  limb([[528, 562], [622, 642], [638, 748]]), // leg onto block
  foot(638, 748, 1, 48),
  limb([[500, 372], [448, 458], [430, 540]]),
  limb([[538, 372], [605, 448], [650, 508]]),
];

poses.band_pull = () => [
  // band held wide at chest height
  obj("M 282 366 Q 512 408 742 366", 10),
  limb([[484, 548], [480, 700], [478, 838]]),
  foot(478, 838, -1),
  limb([[540, 548], [544, 700], [546, 838]]),
  foot(546, 838, 1),
  frontTorso(512, 350, 548),
  neck(512, 252, 346),
  head(512, 248),
  limb([[446, 362], [362, 382], [284, 364]]), // arms drawing band apart
  limb([[578, 362], [662, 382], [740, 364]]),
];

poses.pelvic_tilts = () => [
  // floor line
  obj("M 170 808 L 850 808", 10),
  // lying supine, head left, knees bent
  limb([[330, 778], [470, 782]], 26), // arm resting alongside
  shape(capsule(322, 766, 565, 762, 56)),
  head(266, 756, { facing: "front", tilt: -90 }),
  limb([[565, 762], [684, 642], [722, 786]]), // bent legs
  limb([[722, 786], [776, 786]], 24),
  limb([[582, 768], [700, 650], [738, 790]]),
  cue("M 560 700 A 70 70 0 0 1 638 688"), // pelvic-tilt cue
];

poses.bird_dog = () => [
  // floor line
  obj("M 200 824 L 830 824", 10),
  // kneeling support: knee under hip, shin along floor
  limb([[618, 632], [622, 800], [716, 806]]),
  // supporting arm vertical
  limb([[400, 622], [392, 800]]),
  limb([[368, 806], [418, 806]], 24), // hand
  shape(capsule(400, 612, 618, 624, 58)),
  neck(348, 568, 600, 44),
  head(336, 556, { facing: "left", tilt: -6 }),
  limb([[388, 600], [288, 572], [200, 552]]), // extended arm forward
  limb([[630, 620], [742, 596], [852, 572]]), // extended leg back
];

poses.seated_ball_march = () => [
  // exercise ball behind the hips
  `<circle cx="448" cy="704" r="116" fill="${OBJ_FILL}" stroke="${OBJ}" stroke-width="${OBJ_W}"/>`,
  // seated figure facing right, perched on the front of the ball
  limb([[522, 600], [540, 716], [536, 826]]), // grounded leg in front of ball
  foot(536, 826, 1, 48),
  shape(capsule(512, 595, 520, 405, 58)),
  neck(524, 300, 398),
  head(528, 296, { facing: "right" }),
  limb([[535, 598], [638, 575], [632, 702]]), // marching knee lifted
  foot(632, 702, 1, 44),
  limb([[502, 412], [468, 496], [486, 570]]), // arm steadying
  limb([[538, 412], [582, 492], [596, 548]]),
];

poses.posture_wall = () => [
  // wall behind the figure
  obj("M 636 270 L 636 850", 16),
  // standing tall, back lightly against the wall, facing left
  limb([[588, 552], [592, 702], [594, 840]]),
  foot(594, 840, -1, 50),
  limb([[572, 550], [576, 700], [578, 838]]),
  shape(capsule(582, 548, 588, 356, 60)),
  neck(586, 252, 350),
  head(582, 248, { facing: "left" }),
  limb([[562, 366], [550, 462], [556, 556]]), // arms relaxed at sides
];

poses.shoulder_blade_squeeze = () => [
  limb([[484, 548], [480, 700], [478, 838]]),
  foot(478, 838, -1),
  limb([[540, 548], [544, 700], [546, 838]]),
  foot(546, 838, 1),
  frontTorso(512, 350, 548),
  neck(512, 252, 346),
  head(512, 248),
  // cactus arms, elbows drawn back and chest open
  limb([[446, 362], [346, 376], [350, 258]]),
  limb([[578, 362], [678, 376], [674, 258]]),
  cue("M 430 430 A 46 46 0 0 1 480 446"),
  cue("M 594 430 A 46 46 0 0 0 544 446"),
];

poses.supported_one_leg_balance = () => [
  // support post
  obj("M 295 392 L 295 850", 16),
  obj("M 262 392 L 328 392"),
  limb([[540, 548], [544, 700], [546, 838]]), // standing leg
  foot(546, 838, 1),
  frontTorso(512, 350, 548),
  neck(512, 252, 346),
  head(512, 248),
  limb([[484, 548], [464, 652], [502, 742]]), // lifted leg tucked
  foot(502, 742, -1, 44),
  limb([[446, 360], [372, 420], [306, 412]]), // hand on post
  limb([[578, 360], [606, 462], [588, 548]]), // arm relaxed
];

poses.tandem_stand = () => [
  obj("M 360 858 L 680 858", 10), // ground hint
  // heel-to-toe stance, side view facing right
  limb([[498, 552], [474, 700], [466, 834]]), // back leg
  foot(466, 834, 1, 50),
  limb([[512, 552], [532, 700], [540, 834]]), // front leg
  foot(540, 834, 1, 50),
  shape(capsule(505, 550, 512, 356, 60)),
  neck(514, 250, 350),
  head(518, 246, { facing: "right" }),
  limb([[486, 364], [428, 448], [398, 522]]), // arms slightly out
  limb([[538, 364], [598, 446], [630, 518]]),
];

poses.heel_to_toe_walk = () => [
  obj("M 280 858 L 760 858", 10),
  // mid-step along a line, facing right
  limb([[492, 552], [452, 698], [438, 820]]), // back leg, heel rising
  limb([[438, 820], [482, 842]], 24),
  limb([[518, 552], [578, 694], [600, 824]]), // front leg landing
  limb([[600, 824], [648, 806]], 24), // toe up
  shape(capsule(502, 550, 518, 356, 60)),
  neck(522, 250, 350),
  head(526, 246, { facing: "right" }),
  limb([[486, 364], [410, 426], [356, 478]]), // arms wide for balance
  limb([[546, 364], [624, 422], [678, 470]]),
];

poses.weight_shifts = () => [
  // wide stance, weight shifted to the left
  limb([[452, 552], [428, 700], [418, 838]]), // loaded leg
  foot(418, 838, -1),
  limb([[528, 545], [592, 698], [612, 838]]), // light leg
  foot(612, 838, 1),
  frontTorso(488, 352, 548),
  neck(484, 254, 348),
  head(480, 250, { tilt: -6 }),
  limb([[424, 364], [382, 452], [432, 528]]), // hands on hips
  limb([[552, 364], [596, 452], [546, 528]]),
  cue("M 330 590 A 56 56 0 0 1 330 510"),
  cue("M 680 510 A 56 56 0 0 1 680 590"),
];

poses.neck_mobility = () => [
  // three-quarter figure with a gentle head tilt
  frontTorso(512, 430, 660, 92, 70),
  limb([[432, 442], [398, 560], [420, 660]]),
  limb([[592, 442], [626, 560], [604, 660]]),
  neck(512, 318, 426, 54),
  head(516, 312, { r: 54, tilt: 22 }),
  cue("M 380 300 A 58 58 0 0 1 414 246"),
  cue("M 650 246 A 58 58 0 0 1 684 300"),
];

poses.hamstring_stretch = () => [
  // standing stretch facing right: front heel planted, hands on thigh
  limb([[438, 592], [432, 716], [428, 840]]), // back leg
  foot(428, 840, 1, 48),
  limb([[458, 596], [558, 700], [622, 822]]), // front leg straight
  limb([[622, 822], [664, 790]], 24), // toe up
  shape(capsule(448, 588, 492, 420, 58)),
  neck(502, 320, 415, 44),
  head(508, 314, { facing: "right", tilt: 12 }),
  limb([[492, 428], [542, 520], [538, 600]]), // hands resting on thigh
  limb([[505, 438], [556, 532], [552, 612]]),
];

poses.shoulder_circles = () => [
  limb([[484, 548], [480, 700], [478, 838]]),
  foot(478, 838, -1),
  limb([[540, 548], [544, 700], [546, 838]]),
  foot(546, 838, 1),
  frontTorso(512, 350, 548),
  neck(512, 252, 346),
  head(512, 248),
  limb([[446, 360], [428, 462], [444, 552]]), // arms relaxed
  limb([[578, 360], [596, 462], [580, 552]]),
  cue("M 398 422 A 44 44 0 1 1 442 378"), // circle cues at the shoulders
  cue("M 626 378 A 44 44 0 1 1 582 422"),
];

poses.hip_mobility = () => [
  limb([[484, 552], [474, 702], [470, 838]]),
  foot(470, 838, -1),
  limb([[540, 552], [550, 702], [554, 838]]),
  foot(554, 838, 1),
  frontTorso(512, 352, 550),
  neck(512, 254, 348),
  head(512, 250),
  limb([[446, 364], [392, 452], [462, 538]]), // hands on hips
  limb([[578, 364], [632, 452], [562, 538]]),
  cue("M 388 568 A 130 44 0 0 0 512 600"), // hip-circle cue
  cue("M 636 532 A 130 44 0 0 0 560 508"),
];

poses.ankle_mobility = () => [
  // chair facing right
  obj("M 420 640 L 610 640"),
  obj("M 425 640 L 425 415"),
  obj("M 445 640 L 445 850"),
  obj("M 590 640 L 590 850"),
  // seated figure, one leg extended circling the ankle
  limb([[540, 618], [536, 722], [532, 812]]), // grounded leg
  foot(532, 812, 1, 46),
  shape(capsule(530, 612, 540, 430, 56)),
  neck(544, 328, 424),
  head(548, 324, { facing: "right" }),
  limb([[556, 618], [668, 648], [762, 696]]), // extended leg
  limb([[762, 696], [800, 668]], 24),
  limb([[528, 438], [556, 524], [580, 590]]), // hand resting on thigh
  cue("M 812 752 A 48 48 0 1 1 856 692"), // ankle-circle cue
];

poses.chest_opener = () => [
  limb([[484, 548], [480, 700], [478, 838]]),
  foot(478, 838, -1),
  limb([[540, 548], [544, 700], [546, 838]]),
  foot(546, 838, 1),
  frontTorso(512, 350, 548),
  neck(512, 250, 346),
  head(512, 244, { tilt: 0 }),
  // arms open wide and slightly back, chest lifted
  limb([[446, 358], [350, 396], [266, 442]]),
  limb([[578, 358], [674, 396], [758, 442]]),
];

poses.qigong = () => [
  // soft knees, arms rounded as if holding a ball
  limb([[480, 552], [462, 692], [466, 838]]),
  foot(466, 838, -1),
  limb([[544, 552], [562, 692], [558, 838]]),
  foot(558, 838, 1),
  frontTorso(512, 352, 550),
  neck(512, 254, 348),
  head(512, 250),
  limb([[446, 364], [390, 462], [468, 538]]), // rounded arms
  limb([[578, 364], [634, 462], [556, 538]]),
];

poses.yoga = () => [
  // warrior II: wide stance, front knee bent, arms extended
  limb([[488, 568], [392, 704], [336, 838]]), // back leg straight
  foot(336, 838, -1),
  limb([[522, 568], [646, 688], [682, 836]]), // front leg bent
  foot(682, 836, 1),
  frontTorso(505, 378, 568, 72, 52),
  neck(505, 280, 374),
  head(508, 276, { facing: "right" }),
  limb([[440, 388], [340, 384], [248, 382]]), // arms extended level
  limb([[570, 388], [670, 384], [762, 382]]),
];

poses.current_rehab = () => [
  limb([[484, 548], [480, 700], [478, 838]]),
  foot(478, 838, -1),
  limb([[540, 548], [544, 700], [546, 838]]),
  foot(546, 838, 1),
  frontTorso(512, 350, 548),
  neck(512, 252, 346),
  head(512, 248),
  limb([[446, 360], [424, 462], [442, 550]]), // arm relaxed
  limb([[578, 360], [676, 312], [758, 262]]), // careful raised arm
  cue("M 786 300 A 54 54 0 0 0 766 232"),
];

poses.band_rehab = () => [
  // anchor post with band to the hand, elbow pinned at the side
  obj("M 862 386 L 862 566", 16),
  obj("M 706 474 L 854 474", 10), // band
  limb([[484, 548], [480, 700], [478, 838]]),
  foot(478, 838, -1),
  limb([[540, 548], [544, 700], [546, 838]]),
  foot(546, 838, 1),
  frontTorso(512, 350, 548),
  neck(512, 252, 346),
  head(512, 248),
  limb([[446, 360], [424, 462], [442, 550]]), // free arm relaxed
  limb([[578, 360], [594, 472], [702, 472]]), // banded forearm rotated out
  cue("M 700 530 A 70 70 0 0 0 730 420"),
];

// ── Render ───────────────────────────────────────────────────────────────

function renderSVG(elements) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">` +
    elements.join("") +
    `</svg>`
  );
}

const ids = Object.keys(poses);

await mkdir(OUT_DIR, { recursive: true });

for (const id of ids) {
  const svg = renderSVG(poses[id]());
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  await writeFile(path.join(OUT_DIR, `${id}.png`), png);
  console.log(`rendered ${id}.png (${png.length} bytes)`);
}

// Contact sheet for visual QA (not part of the app).
const cols = 6;
const cell = 170;
const labelH = 26;
const rows = Math.ceil(ids.length / cols);
const sheetParts = [];

for (let i = 0; i < ids.length; i++) {
  const id = ids[i];
  const x = (i % cols) * cell;
  const y = Math.floor(i / cols) * (cell + labelH);
  const png = await sharp(
    Buffer.from(renderSVG(poses[id]()))
  )
    .resize(cell, cell)
    .png()
    .toBuffer();
  sheetParts.push(
    `<image href="data:image/png;base64,${png.toString("base64")}" x="${x}" y="${y}" width="${cell}" height="${cell}"/>`,
    `<text x="${x + cell / 2}" y="${y + cell + 18}" text-anchor="middle" font-family="Helvetica" font-size="14" fill="#9beee8">${id}</text>`
  );
}

const sheetSvg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * cell}" height="${rows * (cell + labelH)}" viewBox="0 0 ${cols * cell} ${rows * (cell + labelH)}">` +
  `<rect width="100%" height="100%" fill="#0b1120"/>` +
  sheetParts.join("") +
  `</svg>`;

await writeFile(
  "/tmp/bb-contact-sheet.png",
  await sharp(Buffer.from(sheetSvg)).png().toBuffer()
);
console.log(`contact sheet: /tmp/bb-contact-sheet.png (${ids.length} images)`);
