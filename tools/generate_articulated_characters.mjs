import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const FRAME_W = 64;
const FRAME_H = 88;
const COLS = 12;
const DIRS = 8;
const GROUND_Y = 82; // Foot contact line in 64x88 frame

const DIR_ANGLES = [
  0,                  // 0: E
  Math.PI / 4,        // 1: SE
  Math.PI / 2,        // 2: S
  (Math.PI * 3) / 4,  // 3: SW
  Math.PI,            // 4: W
  (Math.PI * 5) / 4,  // 5: NW
  (Math.PI * 3) / 2,  // 6: N
  (Math.PI * 7) / 4   // 7: NE
];

const STYLES = [
  { id: 'p0', skin: '#a98263', hair: '#2f2620', jacket: '#4d5544', shirt: '#7b7462', pants: '#3d4045', shoes: '#1c1b1a', beard: true, scale: 1.0, gore: 0, archetype: 'survivor' },
  { id: 'p1', skin: '#c19a77', hair: '#5a3d28', jacket: '#5d4736', shirt: '#9c8e79', pants: '#4b4a42', shoes: '#24211e', bag: '#3d3a2f', scale: 1.02, gore: 0, archetype: 'survivor' },
  { id: 'p2', skin: '#8f6b4f', hair: '#171a1c', jacket: '#38444f', shirt: '#6f7b80', pants: '#35383b', shoes: '#1a1a1a', hat: '#2b3238', scarf: '#7c4b3a', scale: 0.98, gore: 0, archetype: 'survivor' },
  { id: 'p3', skin: '#b08a68', hair: '#6d4a2f', jacket: '#5b3436', shirt: '#8a6e5e', pants: '#33322f', shoes: '#1c1a18', hat: '#3c3428', bag: '#4a4133', scale: 1.01, gore: 0, archetype: 'survivor' },
  { id: 'z0', skin: '#788773', hair: '#352e25', jacket: '#524b42', shirt: '#6e6557', pants: '#3a3933', shoes: '#1f1e1c', zombie: true, scale: 1.0, gore: 1.0, archetype: 'walker' },
  { id: 'z1', skin: '#868a78', hair: '#29251f', jacket: '#5e3830', shirt: '#7a6c58', pants: '#3a3832', shoes: '#1e1c19', zombie: true, scale: 0.95, gore: 1.3, archetype: 'runner' },
  { id: 'z2', skin: '#6e7a69', hair: '#1a1814', jacket: '#353a3b', shirt: '#5f5a4e', pants: '#2c2d29', shoes: '#181816', zombie: true, scale: 1.18, gore: 1.8, archetype: 'brute' },
];

async function main() {
  const charDir = 'client/public/assets/characters';
  if (!fs.existsSync(charDir)) fs.mkdirSync(charDir, { recursive: true });

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } });

  for (const style of STYLES) {
    console.log(`Generating articulate spritesheet for ${style.id} (${style.archetype})...`);

    const pngBase64 = await page.evaluate(({ style, FRAME_W, FRAME_H, COLS, DIRS, GROUND_Y, DIR_ANGLES }) => {
      function shade(color, percent) {
        let R = parseInt(color.substring(1, 3), 16);
        let G = parseInt(color.substring(3, 5), 16);
        let B = parseInt(color.substring(5, 7), 16);
        R = Math.max(0, Math.min(255, Math.round(R * (1 + percent))));
        G = Math.max(0, Math.min(255, Math.round(G * (1 + percent))));
        B = Math.max(0, Math.min(255, Math.round(B * (1 + percent))));
        const RR = R.toString(16).padStart(2, '0');
        const GG = G.toString(16).padStart(2, '0');
        const BB = B.toString(16).padStart(2, '0');
        return `#${RR}${GG}${BB}`;
      }

      function drawCapsule(ctx, x1, y1, x2, y2, r1, r2, color) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const dist = Math.hypot(dx, dy) || 1;
        const nx = -dy / dist;
        const ny = dx / dist;

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x1, y1, r1, Math.atan2(dy, dx) + Math.PI / 2, Math.atan2(dy, dx) - Math.PI / 2);
        ctx.arc(x2, y2, r2, Math.atan2(dy, dx) - Math.PI / 2, Math.atan2(dy, dx) + Math.PI / 2);
        ctx.closePath();
        ctx.fill();
      }

      const sheet = document.createElement('canvas');
      sheet.width = FRAME_W * COLS; // 768
      sheet.height = FRAME_H * DIRS; // 704
      const sCtx = sheet.getContext('2d');
      sCtx.imageSmoothingEnabled = true;

      // Draw each direction row
      for (let dir = 0; dir < DIRS; dir++) {
        const angle = DIR_ANGLES[dir];
        const fx = Math.cos(angle);
        const fy = Math.sin(angle);
        const front = fy;
        const side = fx;
        const isFacingCam = front > -0.2;
        const isProfile = Math.abs(side) > 0.65;

        for (let col = 0; col < COLS; col++) {
          const destX = col * FRAME_W;
          const destY = dir * FRAME_H;

          sCtx.save();
          sCtx.translate(destX + FRAME_W / 2, destY + GROUND_Y);
          sCtx.scale(style.scale, style.scale);

          // Ground shadow (drawn precisely under feet)
          sCtx.fillStyle = 'rgba(0, 0, 0, 0.42)';
          sCtx.beginPath();
          const shadowR = style.archetype === 'brute' ? 14 : 10.5;
          sCtx.ellipse(0, 1, shadowR, shadowR * 0.44, 0, 0, Math.PI * 2);
          sCtx.fill();

          if (col >= 9) {
            // Death animation sequence (cols 9, 10, 11)
            const step = col - 9;
            if (step === 0) {
              // Frame 9: Fatal impact shock. Torso jerks back, knees buckle
              sCtx.rotate(-0.25 * (side >= 0 ? 1 : -1));
              sCtx.translate(0, 3);
              drawHumanoid(sCtx, style, angle, 0, 0, 0, -1, 0.35, true);
            } else if (step === 1) {
              // Frame 10: Collapse downward toward the floor
              sCtx.rotate(-0.75 * (side >= 0 ? 1 : -1));
              sCtx.translate(0, 10);
              sCtx.scale(1.05, 0.65);
              drawHumanoid(sCtx, style, angle, 0, 0, 0, -1, 0.75, true);
            } else {
              // Frame 11: Flat corpse resting on floor
              drawCorpse(sCtx, style);
            }
          } else {
            // Walk / Idle / Attack sequence
            const isIdle = col === 0;
            const isWalk = col >= 1 && col <= 5;
            const isAttack = col >= 6 && col <= 8;

            let walkPhase = 0;
            let sprintBoost = 0;
            if (isWalk) {
              // 5 walk frames: 1/5 of cycle each
              walkPhase = ((col - 1) / 5) * Math.PI * 2;
            }

            let atkPhase = -1;
            if (isAttack) {
              atkPhase = col - 6; // 0: windup, 1: strike, 2: recovery
            }

            drawHumanoid(sCtx, style, angle, walkPhase, isIdle ? 1 : 0, atkPhase, -1, 0, false);
          }

          sCtx.restore();
        }
      }

      function drawHumanoid(ctx, style, angle, phase, idle, atkStep, weaponId, deathBlend, isDying) {
        const fx = Math.cos(angle);
        const fy = Math.sin(angle);
        const front = fy;
        const side = fx;
        const isZombie = !!style.zombie;
        const archetype = style.archetype;

        // Kinematics calculations
        let stride = 0;
        let liftL = 0;
        let liftR = 0;
        let hipSway = 0;
        let torsoBob = 0;
        let leanForward = isZombie ? (archetype === 'runner' ? 3.8 : 2.0) : 1.2;

        if (phase > 0 || (!idle && atkStep < 0)) {
          // Walk cycle mechanics
          stride = Math.sin(phase);
          const rawBob = Math.abs(Math.sin(phase));

          if (archetype === 'walker') {
            // Asymmetric limp
            stride = Math.sin(phase) + 0.35 * Math.sin(phase * 2);
            torsoBob = rawBob * 2.5;
            hipSway = Math.sin(phase) * 2.8;
            liftL = Math.max(0, Math.sin(phase)) * 6.5; // one leg drags lower
            liftR = Math.max(0, -Math.sin(phase)) * 3.5;
          } else if (archetype === 'runner') {
            // Fast predatory stride
            stride = Math.sin(phase) * 1.4;
            torsoBob = rawBob * 3.2;
            hipSway = Math.sin(phase) * 2.0;
            liftL = Math.max(0, Math.sin(phase)) * 8.0;
            liftR = Math.max(0, -Math.sin(phase)) * 8.0;
          } else if (archetype === 'brute') {
            // Heavy stomp
            stride = Math.sin(phase) * 0.85;
            torsoBob = rawBob * 4.0;
            hipSway = Math.sin(phase) * 3.6;
            liftL = Math.max(0, Math.sin(phase)) * 5.0;
            liftR = Math.max(0, -Math.sin(phase)) * 5.0;
          } else {
            // Survivor athletic walk
            stride = Math.sin(phase) * 1.1;
            torsoBob = rawBob * 2.2;
            hipSway = Math.sin(phase) * 1.8;
            liftL = Math.max(0, Math.sin(phase)) * 6.0;
            liftR = Math.max(0, -Math.sin(phase)) * 6.0;
          }
        } else if (idle) {
          // Subtle breathing shift
          torsoBob = 0.5;
          stride = 0;
        }

        // Hips & Waist position (relative to foot ground y = 0)
        const hipBaseY = -34;
        const hipX = hipSway * 0.4 + fx * leanForward;
        const hipY = hipBaseY + torsoBob * 0.4;

        // --- 1. LEGS (Articulated Thigh, Knee, Shin, Boot) ---
        // Left Leg
        const leftStride = stride;
        const leftLift = liftL;
        const hipLeftX = hipX - 3.5 * (1 - Math.abs(fx) * 0.5);
        const hipLeftY = hipY;

        // Knee & Foot calculation:
        // Stance foot MUST touch y = 0 when lift is 0!
        const footLeftX = hipLeftX + leftStride * 8 * (Math.abs(fx) > 0.3 ? (fx > 0 ? 1 : -1) : 0.4);
        const footLeftY = -leftLift;
        const kneeLeftX = (hipLeftX + footLeftX) / 2 + (leftLift > 0.5 ? 2.5 * fx : 0);
        const kneeLeftY = (hipLeftY + footLeftY) / 2 - 2;

        // Right Leg
        const rightStride = -stride;
        const rightLift = liftR;
        const hipRightX = hipX + 3.5 * (1 - Math.abs(fx) * 0.5);
        const hipRightY = hipY;

        const footRightX = hipRightX + rightStride * 8 * (Math.abs(fx) > 0.3 ? (fx > 0 ? 1 : -1) : 0.4);
        const footRightY = -rightLift;
        const kneeRightX = (hipRightX + footRightX) / 2 + (rightLift > 0.5 ? 2.5 * fx : 0);
        const kneeRightY = (hipRightY + footRightY) / 2 - 2;

        // Draw order: far leg first, then torso, then near leg
        const farLegIsLeft = side < 0;
        const drawLeg = (hx, hy, kx, ky, footX, footY, isNear) => {
          const colPants = isNear ? style.pants : shade(style.pants, -0.22);
          const colBoot = isNear ? style.shoes : shade(style.shoes, -0.25);
          const thighW = archetype === 'brute' ? 4.8 : 3.8;
          const shinW = archetype === 'brute' ? 4.0 : 3.0;

          // Thigh
          drawCapsule(ctx, hx, hy, kx, ky, thighW, shinW, colPants);
          // Shin
          drawCapsule(ctx, kx, ky, footX, footY - 2, shinW, shinW * 0.85, colPants);
          // Boot / Shoe resting at ground level
          ctx.fillStyle = colBoot;
          ctx.beginPath();
          ctx.ellipse(footX + (fx >= 0 ? 1 : -1) * 1.5, footY - 1.5, 4.2, 2.4, fx * 0.2, 0, Math.PI * 2);
          ctx.fill();
        };

        if (farLegIsLeft) {
          drawLeg(hipLeftX, hipLeftY, kneeLeftX, kneeLeftY, footLeftX, footLeftY, false);
          drawLeg(hipRightX, hipRightY, kneeRightX, kneeRightY, footRightX, footRightY, true);
        } else {
          drawLeg(hipRightX, hipRightY, kneeRightX, kneeRightY, footRightX, footRightY, false);
          drawLeg(hipLeftX, hipLeftY, kneeLeftX, kneeLeftY, footLeftX, footLeftY, true);
        }

        // --- 2. TORSO & CHEST ---
        const chestY = hipY - 22;
        const chestX = hipX + fx * (leanForward * 0.6);
        const torsoW = archetype === 'brute' ? 14 : 9.5;

        // Backpack behind torso
        if (style.bag && front < 0.4) {
          ctx.fillStyle = style.bag;
          ctx.beginPath();
          ctx.ellipse(chestX - side * 2.5, chestY + 6, 8.5, 11, 0.05, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = shade(style.bag, -0.25);
          ctx.fillRect(chestX - side * 2.5 - 5, chestY + 1, 10, 3.5);
        }

        // Torso jacket
        ctx.fillStyle = style.jacket;
        ctx.beginPath();
        ctx.moveTo(chestX - torsoW, chestY);
        ctx.quadraticCurveTo(chestX - torsoW * 1.1, chestY + 12, hipX - torsoW * 0.65, hipY);
        ctx.quadraticCurveTo(hipX, hipY + 2.5, hipX + torsoW * 0.65, hipY);
        ctx.quadraticCurveTo(chestX + torsoW * 1.1, chestY + 12, chestX + torsoW, chestY);
        ctx.quadraticCurveTo(chestX, chestY - 4.5, chestX - torsoW, chestY);
        ctx.closePath();
        ctx.fill();

        // Jacket front opening & zipper
        if (front > -0.3) {
          ctx.fillStyle = style.shirt;
          ctx.beginPath();
          ctx.moveTo(chestX - 3.5, chestY - 2);
          ctx.lineTo(chestX + 3.5, chestY - 2);
          ctx.lineTo(chestX + 1.8, chestY + 14);
          ctx.lineTo(chestX - 1.8, chestY + 14);
          ctx.closePath();
          ctx.fill();

          ctx.strokeStyle = shade(style.jacket, -0.35);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(chestX, chestY - 2);
          ctx.lineTo(chestX, hipY);
          ctx.stroke();
        }

        // Gore/blood on zombie torso
        if (isZombie) {
          ctx.fillStyle = 'rgba(75, 12, 10, 0.55)';
          ctx.beginPath();
          ctx.ellipse(chestX - 2, chestY + 8, 4.5, 3, 0.3, 0, Math.PI * 2);
          ctx.fill();
        }

        // --- 3. ARMS & WEAPON SWING ---
        const armSwing = -stride * (isZombie ? 3 : 5);
        const shoulderL_X = chestX - torsoW * 0.9;
        const shoulderR_X = chestX + torsoW * 0.9;
        const shoulderY = chestY + 2;

        const drawArm = (shX, shY, swingOffset, isNear) => {
          let handX = shX + (isNear ? side * 2 : -side * 2);
          let handY = shY + 17;
          let elbowX = shX;
          let elbowY = shY + 9;

          if (isZombie) {
            // Outstretched clutching arms
            handX = shX + fx * 12 + (isNear ? 2 : -2);
            handY = shY + 4 + fy * 5;
            elbowX = (shX + handX) / 2;
            elbowY = shY + 4;
          } else if (atkStep >= 0) {
            // Attack animation on weapon arm
            if (atkStep === 0) {
              // Windup: coil back
              handX = shX - fx * 8;
              handY = shY - 6;
              elbowX = shX - fx * 5;
              elbowY = shY + 2;
            } else if (atkStep === 1) {
              // Strike / lunge: forward slash
              handX = shX + fx * 16;
              handY = shY + 2 + fy * 6;
              elbowX = shX + fx * 8;
              elbowY = shY + 2;
            } else {
              // Recovery: settling forward
              handX = shX + fx * 7;
              handY = shY + 12;
              elbowX = shX + fx * 3;
              elbowY = shY + 7;
            }
          } else {
            // Walking arm counter-swing
            handX += fx * swingOffset;
            handY += fy * swingOffset * 0.4;
            elbowX += fx * (swingOffset * 0.5);
          }

          const armW = archetype === 'brute' ? 4.4 : 3.0;
          const colJacket = isNear ? style.jacket : shade(style.jacket, -0.22);
          // Upper arm
          drawCapsule(ctx, shX, shY, elbowX, elbowY, armW, armW * 0.85, colJacket);
          // Forearm
          drawCapsule(ctx, elbowX, elbowY, handX, handY, armW * 0.85, armW * 0.7, colJacket);
          // Hand
          ctx.fillStyle = isNear ? style.skin : shade(style.skin, -0.2);
          ctx.beginPath();
          ctx.arc(handX, handY, 2.2, 0, Math.PI * 2);
          ctx.fill();

          // Weapon in strike frame
          if (atkStep >= 0 && isNear && !isZombie) {
            ctx.save();
            ctx.translate(handX, handY);
            const wAngle = atkStep === 0 ? -0.8 : atkStep === 1 ? 0.35 : 0.8;
            ctx.rotate(Math.atan2(fy, fx) + (side >= 0 ? wAngle : -wAngle));
            // Spiked bat
            ctx.fillStyle = '#b48a56';
            ctx.fillRect(0, -1.8, 20, 3.6);
            ctx.fillStyle = '#6b4f2c';
            ctx.fillRect(-3, -2.2, 5, 4.4);
            // Metal spikes
            ctx.fillStyle = '#c5ccd0';
            ctx.fillRect(8, -3.2, 1.8, 6.4);
            ctx.fillRect(14, -3.2, 1.8, 6.4);
            ctx.restore();
          }
        };

        if (side < 0) {
          drawArm(shoulderL_X, shoulderY, armSwing, false);
          drawArm(shoulderR_X, shoulderY, -armSwing, true);
        } else {
          drawArm(shoulderR_X, shoulderY, -armSwing, false);
          drawArm(shoulderL_X, shoulderY, armSwing, true);
        }

        // --- 4. NECK & HEAD ---
        const neckX = chestX;
        const neckY = chestY - 4;
        const headR = archetype === 'brute' ? 9.2 : 7.6;
        const headX = neckX + fx * 1.6;
        const headY = neckY - 8 + (isZombie ? 2.5 : 0);

        // Neck
        ctx.fillStyle = shade(style.skin, -0.22);
        ctx.fillRect(neckX - 2.5, neckY - 2, 5, 5);

        // Head base
        ctx.fillStyle = style.skin;
        ctx.beginPath();
        ctx.ellipse(headX, headY, headR * 0.92, headR, 0, 0, Math.PI * 2);
        ctx.fill();

        // Facial details when facing camera
        if (front > -0.25) {
          // Eyes
          ctx.fillStyle = isZombie ? '#d64233' : '#1e1c18';
          const eyeOffX = 2.8 * (1 - Math.abs(fx) * 0.35);
          ctx.beginPath();
          ctx.arc(headX - eyeOffX + side * 1.5, headY - 0.5, isZombie ? 1.4 : 1.1, 0, Math.PI * 2);
          ctx.arc(headX + eyeOffX + side * 1.5, headY - 0.5, isZombie ? 1.4 : 1.1, 0, Math.PI * 2);
          ctx.fill();

          // Beard
          if (style.beard) {
            ctx.fillStyle = style.hair;
            ctx.beginPath();
            ctx.arc(headX + side * 1.5, headY + 3.5, 4.2, 0, Math.PI);
            ctx.fill();
          }

          // Scarf
          if (style.scarf) {
            ctx.fillStyle = style.scarf;
            ctx.fillRect(neckX - 5, neckY - 3, 10, 5.5);
          }
        }

        // Hair / Hat
        if (style.hat) {
          ctx.fillStyle = style.hat;
          ctx.beginPath();
          ctx.ellipse(headX, headY - headR * 0.55, headR * 1.15, headR * 0.7, 0, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = style.hair;
          ctx.beginPath();
          ctx.ellipse(headX, headY - headR * 0.45, headR * 1.05, headR * 0.65, 0, Math.PI, Math.PI * 2);
          ctx.fill();
        }
      }

      function drawCorpse(ctx, style) {
        // Flat isometric fallen corpse resting on ground shadow
        ctx.save();
        ctx.rotate(-0.35);
        ctx.fillStyle = 'rgba(70, 10, 8, 0.45)';
        ctx.beginPath();
        ctx.ellipse(0, 0, 24, 8, 0, 0, Math.PI * 2);
        ctx.fill();

        // Torso
        ctx.fillStyle = shade(style.jacket, -0.2);
        ctx.beginPath();
        ctx.ellipse(2, -3, 16, 7, 0.05, 0, Math.PI * 2);
        ctx.fill();

        // Legs
        drawCapsule(ctx, 12, -2, 26, 3, 3.5, 2.5, style.pants);
        drawCapsule(ctx, 10, -5, 24, -7, 3.2, 2.3, shade(style.pants, -0.18));

        // Arms
        drawCapsule(ctx, -8, -4, -22, -1, 3.0, 2.2, style.jacket);

        // Head
        ctx.fillStyle = style.skin;
        ctx.beginPath();
        ctx.ellipse(-18, -6, 6.0, 5.2, 0.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = style.hair;
        ctx.beginPath();
        ctx.ellipse(-19, -8, 5.5, 3.8, 0.2, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      return sheet.toDataURL('image/png').split(',')[1];
    }, { style, FRAME_W, FRAME_H, COLS, DIRS, GROUND_Y, DIR_ANGLES });

    const outSheetPath = path.join(charDir, `char_${style.id}.png`);
    fs.writeFileSync(outSheetPath, Buffer.from(pngBase64, 'base64'));

    // Also generate matching clean corpse sprite (110x70)
    const corpseBase64 = await page.evaluate(({ style }) => {
      const c = document.createElement('canvas');
      c.width = 110;
      c.height = 70;
      const ctx = c.getContext('2d');
      ctx.translate(55, 42);
      ctx.scale(1.4, 1.4);

      function shade(color, percent) {
        let R = parseInt(color.substring(1, 3), 16);
        let G = parseInt(color.substring(3, 5), 16);
        let B = parseInt(color.substring(5, 7), 16);
        R = Math.max(0, Math.min(255, Math.round(R * (1 + percent))));
        G = Math.max(0, Math.min(255, Math.round(G * (1 + percent))));
        B = Math.max(0, Math.min(255, Math.round(B * (1 + percent))));
        const RR = R.toString(16).padStart(2, '0');
        const GG = G.toString(16).padStart(2, '0');
        const BB = B.toString(16).padStart(2, '0');
        return `#${RR}${GG}${BB}`;
      }
      function drawCapsule(ctx, x1, y1, x2, y2, r1, r2, color) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const dist = Math.hypot(dx, dy) || 1;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x1, y1, r1, Math.atan2(dy, dx) + Math.PI / 2, Math.atan2(dy, dx) - Math.PI / 2);
        ctx.arc(x2, y2, r2, Math.atan2(dy, dx) - Math.PI / 2, Math.atan2(dy, dx) + Math.PI / 2);
        ctx.closePath();
        ctx.fill();
      }

      ctx.rotate(-0.35);
      ctx.fillStyle = 'rgba(70, 10, 8, 0.45)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 24, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = shade(style.jacket, -0.2);
      ctx.beginPath();
      ctx.ellipse(2, -3, 16, 7, 0.05, 0, Math.PI * 2);
      ctx.fill();

      drawCapsule(ctx, 12, -2, 26, 3, 3.5, 2.5, style.pants);
      drawCapsule(ctx, 10, -5, 24, -7, 3.2, 2.3, shade(style.pants, -0.18));
      drawCapsule(ctx, -8, -4, -22, -1, 3.0, 2.2, style.jacket);

      ctx.fillStyle = style.skin;
      ctx.beginPath();
      ctx.ellipse(-18, -6, 6.0, 5.2, 0.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = style.hair;
      ctx.beginPath();
      ctx.ellipse(-19, -8, 5.5, 3.8, 0.2, Math.PI, Math.PI * 2);
      ctx.fill();

      return c.toDataURL('image/png').split(',')[1];
    }, { style });

    const outCorpsePath = path.join(charDir, `corpse_${style.id}.png`);
    fs.writeFileSync(outCorpsePath, Buffer.from(corpseBase64, 'base64'));

    console.log(`Saved ${outSheetPath} and ${outCorpsePath}`);
  }

  await browser.close();
  console.log('All character spritesheets successfully generated!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
