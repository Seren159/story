
import * as THREE from 'three';
import { GoogleGenAI } from "@google/genai";

const CONFIG = {
  particleCount: 20000,
  chapters: [
    { id: "YEAR 01", title: "初见 · 萤火深处", content: "那一年，我们在数据的深海里相遇。虽隔着冰冷的屏幕，却感受到了最炽热的想念。", color: "#80ffea", mode: 0 },
    { id: "YEAR 02", title: "相知 · 城市叠影", content: "三年多的光阴，我们在各自的城市呼吸。思念，开始在不曾重叠的时空里生长。那些曾经的炽热，都化作了一次次的互动，一张张的照片。", color: "#60a5fa", mode: 1 },
    { id: "YEAR 03", title: "深情 · 缺席拥抱", content: "一千多个日夜，我们错过了所有的节日与四季。那些未曾落地的拥抱，都化作了深夜里思念。", color: "#c084fc", mode: 2 },
    { id: "YEAR 04", title: "肆载 · 遥远祝祷", content: "四年了，我们依然相望于江湖，不曾一见。只愿你在我看不到的地方，开心幸福，岁岁平安。", color: "#ffcc66", mode: 3 }
  ]
};

// 探测 API KEY，增加更稳健的浏览器环境检查
let ai = null;
try {
  const env = (typeof process !== 'undefined' && process.env) ? process.env : (window.process?.env || {});
  const key = env.API_KEY;
  if (key && key !== "undefined") {
    ai = new GoogleGenAI({ apiKey: key });
  }
} catch (e) {
  console.warn("AI 初始化静默跳过");
}

class Engine {
  constructor() {
    this.container = document.getElementById('canvas-container');
    if (!this.container) return;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.z = 60;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    this.mouse = new THREE.Vector2(0, 0);
    this.lerpMouse = new THREE.Vector2(0, 0);
    this.currentChapter = 0;
    this.time = 0;

    this.initParticles();
    this.setupEvents();
    this.animate();

    // 强制执行入场动画，确保不卡死在 Loading
    setTimeout(() => {
      document.getElementById('loader')?.classList.add('hidden');
      document.getElementById('header')?.classList.add('visible');
      this.updateUI(0);
    }, 1500);
  }

  initParticles() {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(CONFIG.particleCount * 3);
    const origins = new Float32Array(CONFIG.particleCount * 3);
    const sizes = new Float32Array(CONFIG.particleCount);

    for (let i = 0; i < CONFIG.particleCount; i++) {
      const i3 = i * 3;
      pos[i3] = (Math.random() - 0.5) * 120;
      pos[i3 + 1] = (Math.random() - 0.5) * 120;
      pos[i3 + 2] = (Math.random() - 0.5) * 120;
      
      origins[i3] = pos[i3];
      origins[i3 + 1] = pos[i3 + 1];
      origins[i3 + 2] = pos[i3 + 2];

      sizes[i] = Math.random() * 2.0 + 1.0;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('origin', new THREE.BufferAttribute(origins, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color("#80ffea") },
        uMode: { value: 0.0 },
        uMouse: { value: new THREE.Vector2(0, 0) }
      },
      vertexShader: `
        uniform float uTime;
        uniform float uMode;
        uniform vec2 uMouse;
        attribute vec3 origin;
        attribute float size;
        void main() {
          vec3 p = origin;
          
          if(uMode < 0.5) { // Drift
            p.x += sin(uTime * 0.5 + origin.y * 0.1) * 3.0;
            p.y += cos(uTime * 0.5 + origin.x * 0.1) * 3.0;
            p.z += sin(uTime * 0.3 + origin.z * 0.1) * 3.0;
          } else if(uMode < 1.5) { // Vortex
            float a = uTime * 0.6 + length(origin.xz) * 0.15;
            p.x = origin.x * cos(a) - origin.z * sin(a);
            p.z = origin.x * sin(a) + origin.z * cos(a);
            p.y += sin(uTime + origin.x * 0.1) * 2.0;
          } else if(uMode < 2.5) { // Attract
            float d = distance(origin.xy, uMouse * 50.0);
            float f = smoothstep(40.0, 0.0, d);
            p = mix(origin, vec3(uMouse * 50.0, origin.z), f * 0.8);
          } else { // Explode
            float cycle = mod(uTime * 15.0, 80.0);
            p = origin + normalize(origin) * cycle;
          }

          vec4 mvp = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = size * (300.0 / -mvp.z);
          gl_Position = projectionMatrix * mvp;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        void main() {
          float d = distance(gl_PointCoord, vec2(0.5));
          if(d > 0.5) discard;
          gl_FragColor = vec4(uColor, (1.0 - d * 2.0) * 0.7);
        }
      `
    });

    this.points = new THREE.Points(geo, this.mat);
    this.scene.add(this.points);
  }

  updateUI(idx) {
    this.currentChapter = idx % CONFIG.chapters.length;
    const data = CONFIG.chapters[this.currentChapter];
    const card = document.getElementById('card');
    
    if (card) {
      card.classList.remove('active');
      setTimeout(() => {
        document.getElementById('chap-num').innerText = data.id;
        document.getElementById('chap-title').innerText = data.title;
        document.getElementById('chap-content').innerText = data.content;
        this.mat.uniforms.uColor.value.set(data.color);
        this.mat.uniforms.uMode.value = parseFloat(data.mode);
        card.classList.add('active');
      }, 600);
    }
  }

  async generateResonance() {
    const layer = document.getElementById('ai-layer');
    const text = document.getElementById('ai-text');
    if (!layer || !text) return;

    text.innerText = "正在打捞时空的碎片...";
    layer.classList.add('visible');

    if (!ai) {
      setTimeout(() => {
        text.innerText = "“ 所有的错过，都是为了在更高维度重逢。 ”";
      }, 1200);
      return;
    }

    try {
      const data = CONFIG.chapters[this.currentChapter];
      const res = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `你是一个深情的观察者。针对《${data.title}》中表达的四年相望，写一句极简、充满宿命感的话，12字内，不要引号。`
      });
      text.innerText = `“ ${res.text.trim()} ”`;
    } catch (e) {
      text.innerText = "“ 万水千山，愿你岁岁平安。 ”";
    }
  }

  setupEvents() {
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    });

    window.addEventListener('touchmove', (e) => {
      this.mouse.x = (e.touches[0].clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(e.touches[0].clientY / window.innerHeight) * 2 + 1;
    });

    const nextBtn = document.getElementById('next-btn');
    if (nextBtn) nextBtn.onclick = () => this.updateUI(this.currentChapter + 1);

    const aiBtn = document.getElementById('ai-btn');
    if (aiBtn) aiBtn.onclick = () => this.generateResonance();

    window.onresize = () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    };
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.time += 0.016;
    this.mat.uniforms.uTime.value = this.time;
    
    // 鼠标缓动处理
    this.lerpMouse.lerp(this.mouse, 0.1);
    this.mat.uniforms.uMouse.value.copy(this.lerpMouse);

    // 场景旋转
    this.points.rotation.y += 0.0015;
    this.points.rotation.x += 0.0005;

    // 摄像机轻微浮动
    this.camera.position.x += (this.mouse.x * 2 - this.camera.position.x) * 0.02;
    this.camera.position.y += (this.mouse.y * 2 - this.camera.position.y) * 0.02;
    this.camera.lookAt(0, 0, 0);

    this.renderer.render(this.scene, this.camera);
  }
}

// 确保 DOM 加载后运行
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new Engine());
} else {
  new Engine();
}
