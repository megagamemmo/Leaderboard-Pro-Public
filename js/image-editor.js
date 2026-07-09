(function() {
  class ScorecardEditor {
    constructor(container) {
      this.container = container;
      this.state = {
        rawImage: null,
        rotation: 0, // 0, 90, 180, 270
        isEnhanced: true,
        cropBox: null, // {x, y, width, height}
        mode: 'view', // 'view' or 'crop'
        pan: { x: 0, y: 0 },
        zoom: 1,
        pointerCache: [],
        lastPinchDistance: -1,
        lastPanPoint: null,
        cropHandle: null // Which handle is being dragged
      };

      this.canvas = document.createElement('canvas');
      this.canvas.className = 'ocr-editor-canvas';
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
      this.canvas.style.touchAction = 'none'; // Prevent browser default zoom/pan

      this.container.innerHTML = '';
      this.container.appendChild(this.canvas);

      // Bind events
      this.canvas.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });
      this.canvas.addEventListener('pointerdown', this.handlePointerDown.bind(this));
      this.canvas.addEventListener('pointermove', this.handlePointerMove.bind(this));
      this.canvas.addEventListener('pointerup', this.handlePointerUp.bind(this));
      this.canvas.addEventListener('pointercancel', this.handlePointerUp.bind(this));
      this.canvas.addEventListener('pointerleave', this.handlePointerUp.bind(this));
      
      const observer = new ResizeObserver(() => this.render());
      observer.observe(this.container);
    }
    
    getState() {
      return {
        rotation: this.state.rotation,
        isEnhanced: this.state.isEnhanced,
        cropBox: this.state.cropBox ? { ...this.state.cropBox } : null
      };
    }
    
    setState(newState) {
      if (!newState) return;
      if (newState.rotation !== undefined) this.state.rotation = newState.rotation;
      if (newState.isEnhanced !== undefined) this.state.isEnhanced = newState.isEnhanced;
      if (newState.cropBox !== undefined) this.state.cropBox = { ...newState.cropBox };
      this.fitToView();
    }

    async loadFile(file) {
      return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(url);
          this.state.rawImage = img;
          
          this.state.rotation = 0;
          this.state.isEnhanced = true;
          this.state.zoom = 1;
          this.state.pan = { x: 0, y: 0 };
          this.state.mode = 'view';
          
          if (window.LB && window.LB.ocr && window.LB.ocr.detectScorecardCropBox) {
            const tempCanvas = document.createElement("canvas");
            tempCanvas.width = img.naturalWidth || img.width;
            tempCanvas.height = img.naturalHeight || img.height;
            const tempCtx = tempCanvas.getContext("2d");
            tempCtx.drawImage(img, 0, 0);
            
            // Try auto-crop on original
            let autoCrop = window.LB.ocr.detectScorecardCropBox(tempCtx, tempCanvas.width, tempCanvas.height);
            
            // Auto rotate if portrait
            if (tempCanvas.height >= tempCanvas.width * 1.3) {
                // Determine CW vs CCW
                const cw = document.createElement("canvas");
                cw.width = tempCanvas.height;
                cw.height = tempCanvas.width;
                const cwCtx = cw.getContext("2d");
                cwCtx.translate(cw.width / 2, cw.height / 2);
                cwCtx.rotate((90 * Math.PI) / 180);
                cwCtx.drawImage(tempCanvas, -tempCanvas.width / 2, -tempCanvas.height / 2);
                
                const cwCrop = window.LB.ocr.detectScorecardCropBox(cwCtx, cw.width, cw.height);
                const cwRatio = cwCrop ? (cwCrop.width / Math.max(1, cwCrop.height)) : -1;
                
                if (cwRatio > 1.0) {
                    this.state.rotation = 90;
                    autoCrop = cwCrop;
                }
            }
            
            const dims = this.getWorkingDimensions();
            if (autoCrop) {
              this.state.cropBox = autoCrop;
            } else {
              this.state.cropBox = { x: 0, y: 0, width: dims.w, height: dims.h };
            }
          } else {
            const dims = this.getWorkingDimensions();
            this.state.cropBox = { x: 0, y: 0, width: dims.w, height: dims.h };
          }
          
          this.fitToView();
          resolve();
        };
        img.onerror = () => reject(new Error("Không đọc được file ảnh"));
        img.src = url;
      });
    }
    
    getWorkingDimensions() {
      if (!this.state.rawImage) return { w: 0, h: 0 };
      const w = this.state.rawImage.width;
      const h = this.state.rawImage.height;
      if (this.state.rotation === 90 || this.state.rotation === 270) {
        return { w: h, h: w };
      }
      return { w, h };
    }

    fitToView() {
      const containerRect = this.container.getBoundingClientRect();
      const dims = this.getWorkingDimensions();
      if (!dims.w || !dims.h || !containerRect.width || !containerRect.height) return;
      
      const targetBox = this.state.mode === 'crop' ? { width: dims.w, height: dims.h } : (this.state.cropBox || { width: dims.w, height: dims.h });
      
      const scaleX = containerRect.width / targetBox.width;
      const scaleY = containerRect.height / targetBox.height;
      this.state.zoom = Math.min(scaleX, scaleY) * 0.95; // 5% padding
      
      this.state.pan.x = (containerRect.width - targetBox.width * this.state.zoom) / 2;
      this.state.pan.y = (containerRect.height - targetBox.height * this.state.zoom) / 2;
      
      if (this.state.mode === 'view' && this.state.cropBox) {
        this.state.pan.x -= this.state.cropBox.x * this.state.zoom;
        this.state.pan.y -= this.state.cropBox.y * this.state.zoom;
      }
      
      this.render();
    }
    
    setMode(mode) {
      this.state.mode = mode;
      this.fitToView();
    }
    
    toggleEnhance() {
      this.state.isEnhanced = !this.state.isEnhanced;
      this.render();
    }
    
    rotate(direction) {
      if (direction === 'cw') {
        this.state.rotation = (this.state.rotation + 90) % 360;
      } else {
        this.state.rotation = (this.state.rotation + 270) % 360;
      }
      const dims = this.getWorkingDimensions();
      this.state.cropBox = { x: 0, y: 0, width: dims.w, height: dims.h };
      this.fitToView();
    }

    handleWheel(e) {
      e.preventDefault();
      const zoomSensitivity = 0.001;
      const delta = -e.deltaY * zoomSensitivity;
      const newZoom = Math.max(0.01, Math.min(this.state.zoom * Math.exp(delta), 10));
      
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      this.state.pan.x = mouseX - (mouseX - this.state.pan.x) * (newZoom / this.state.zoom);
      this.state.pan.y = mouseY - (mouseY - this.state.pan.y) * (newZoom / this.state.zoom);
      this.state.zoom = newZoom;
      
      this.render();
    }

    handlePointerDown(e) {
      this.canvas.setPointerCapture(e.pointerId);
      this.state.pointerCache.push(e);
      
      if (this.state.mode === 'crop' && this.state.pointerCache.length === 1) {
        const hit = this.hitTestCropHandles(e);
        if (hit) {
          this.state.cropHandle = hit;
          return;
        }
      }
      this.state.lastPanPoint = { x: e.clientX, y: e.clientY };
    }

    handlePointerMove(e) {
      const index = this.state.pointerCache.findIndex(p => p.pointerId === e.pointerId);
      if (index !== -1) {
        this.state.pointerCache[index] = e;
      }

      if (this.state.mode === 'crop' && this.state.cropHandle && this.state.pointerCache.length === 1) {
        this.updateCropBox(e);
        this.render();
        return;
      }

      if (this.state.pointerCache.length === 1 && this.state.lastPanPoint) {
        const dx = e.clientX - this.state.lastPanPoint.x;
        const dy = e.clientY - this.state.lastPanPoint.y;
        this.state.pan.x += dx;
        this.state.pan.y += dy;
        this.state.lastPanPoint = { x: e.clientX, y: e.clientY };
        this.render();
      } else if (this.state.pointerCache.length === 2) {
        const p1 = this.state.pointerCache[0];
        const p2 = this.state.pointerCache[1];
        const dist = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
        
        if (this.state.lastPinchDistance > 0) {
          const delta = dist - this.state.lastPinchDistance;
          const zoomSensitivity = 0.01;
          const newZoom = Math.max(0.01, Math.min(this.state.zoom * (1 + delta * zoomSensitivity), 10));
          
          const rect = this.canvas.getBoundingClientRect();
          const centerX = (p1.clientX + p2.clientX) / 2 - rect.left;
          const centerY = (p1.clientY + p2.clientY) / 2 - rect.top;
          
          this.state.pan.x = centerX - (centerX - this.state.pan.x) * (newZoom / this.state.zoom);
          this.state.pan.y = centerY - (centerY - this.state.pan.y) * (newZoom / this.state.zoom);
          this.state.zoom = newZoom;
          this.render();
        }
        this.state.lastPinchDistance = dist;
      }
    }

    handlePointerUp(e) {
      const index = this.state.pointerCache.findIndex(p => p.pointerId === e.pointerId);
      if (index !== -1) {
        this.state.pointerCache.splice(index, 1);
      }
      if (this.state.pointerCache.length < 2) {
        this.state.lastPinchDistance = -1;
      }
      if (this.state.pointerCache.length === 0) {
        this.state.lastPanPoint = null;
        this.state.cropHandle = null;
      } else if (this.state.pointerCache.length === 1) {
        this.state.lastPanPoint = { x: this.state.pointerCache[0].clientX, y: this.state.pointerCache[0].clientY };
      }
    }
    
    clientToImage(clientX, clientY) {
      const rect = this.canvas.getBoundingClientRect();
      const x = (clientX - rect.left - this.state.pan.x) / this.state.zoom;
      const y = (clientY - rect.top - this.state.pan.y) / this.state.zoom;
      return { x, y };
    }
    
    hitTestCropHandles(e) {
      const pt = this.clientToImage(e.clientX, e.clientY);
      const cb = this.state.cropBox;
      if (!cb) return null;
      
      const hitZone = 30 / this.state.zoom;
      
      const handles = {
        'tl': {x: cb.x, y: cb.y},
        'tr': {x: cb.x + cb.width, y: cb.y},
        'bl': {x: cb.x, y: cb.y + cb.height},
        'br': {x: cb.x + cb.width, y: cb.y + cb.height},
        'center': {x: cb.x + cb.width/2, y: cb.y + cb.height/2, isCenter: true}
      };
      
      for (const [key, pos] of Object.entries(handles)) {
        if (pos.isCenter) {
           if (pt.x > cb.x + hitZone && pt.x < cb.x + cb.width - hitZone &&
               pt.y > cb.y + hitZone && pt.y < cb.y + cb.height - hitZone) {
               return { key: 'center', startX: cb.x, startY: cb.y, ptrX: pt.x, ptrY: pt.y };
           }
        } else {
           if (Math.hypot(pt.x - pos.x, pt.y - pos.y) <= hitZone * 2) {
             return { key };
           }
        }
      }
      return null;
    }

    updateCropBox(e) {
      const pt = this.clientToImage(e.clientX, e.clientY);
      const cb = this.state.cropBox;
      const dims = this.getWorkingDimensions();
      const minSize = 50 / this.state.zoom;
      
      const handle = this.state.cropHandle;
      if (handle.key === 'center') {
        const dx = pt.x - handle.ptrX;
        const dy = pt.y - handle.ptrY;
        cb.x = Math.max(0, Math.min(handle.startX + dx, dims.w - cb.width));
        cb.y = Math.max(0, Math.min(handle.startY + dy, dims.h - cb.height));
        return;
      }

      if (handle.key.includes('l')) {
        const newX = Math.max(0, Math.min(pt.x, cb.x + cb.width - minSize));
        cb.width += cb.x - newX;
        cb.x = newX;
      }
      if (handle.key.includes('r')) {
        cb.width = Math.max(minSize, Math.min(pt.x - cb.x, dims.w - cb.x));
      }
      if (handle.key.includes('t')) {
        const newY = Math.max(0, Math.min(pt.y, cb.y + cb.height - minSize));
        cb.height += cb.y - newY;
        cb.y = newY;
      }
      if (handle.key.includes('b')) {
        cb.height = Math.max(minSize, Math.min(pt.y - cb.y, dims.h - cb.y));
      }
    }

    render() {
      const rect = this.container.getBoundingClientRect();
      this.canvas.width = rect.width;
      this.canvas.height = rect.height;
      
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      
      if (!this.state.rawImage) return;

      ctx.save();
      ctx.translate(this.state.pan.x, this.state.pan.y);
      ctx.scale(this.state.zoom, this.state.zoom);
      
      if (this.state.isEnhanced) {
        ctx.filter = "contrast(1.16) brightness(1.04) saturate(0.88)";
      }
      
      const w = this.state.rawImage.width;
      const h = this.state.rawImage.height;
      const cx = w / 2;
      const cy = h / 2;
      
      const dims = this.getWorkingDimensions();
      
      if (this.state.mode === 'view' && this.state.cropBox) {
        ctx.beginPath();
        ctx.rect(this.state.cropBox.x, this.state.cropBox.y, this.state.cropBox.width, this.state.cropBox.height);
        ctx.clip();
      }
      
      ctx.translate(dims.w / 2, dims.h / 2);
      ctx.rotate((this.state.rotation * Math.PI) / 180);
      ctx.drawImage(this.state.rawImage, -cx, -cy);
      
      ctx.restore();
      
      if (this.state.mode === 'crop' && this.state.cropBox) {
        ctx.save();
        ctx.translate(this.state.pan.x, this.state.pan.y);
        ctx.scale(this.state.zoom, this.state.zoom);
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.beginPath();
        ctx.rect(0, 0, dims.w, dims.h);
        const cb = this.state.cropBox;
        ctx.rect(cb.x, cb.y, cb.width, cb.height);
        ctx.fill("evenodd");
        
        ctx.fillStyle = '#3b6df6'; // warm-blue-500
        const handleSize = 16 / this.state.zoom;
        const drawHandle = (x, y) => {
           ctx.fillRect(x - handleSize/2, y - handleSize/2, handleSize, handleSize);
        };
        drawHandle(cb.x, cb.y);
        drawHandle(cb.x + cb.width, cb.y);
        drawHandle(cb.x, cb.y + cb.height);
        drawHandle(cb.x + cb.width, cb.y + cb.height);
        
        ctx.strokeStyle = '#3b6df6';
        ctx.lineWidth = 2 / this.state.zoom;
        ctx.strokeRect(cb.x, cb.y, cb.width, cb.height);
        
        ctx.restore();
      }
    }

      exportPayload() {
        if (!this.state.rawImage) return null;
        
        const dims = this.getWorkingDimensions();
        const cb = this.state.cropBox || { x: 0, y: 0, width: dims.w, height: dims.h };
        
        const outCanvas = document.createElement('canvas');
        outCanvas.width = cb.width;
        outCanvas.height = cb.height;
        const ctx = outCanvas.getContext('2d');
        
        if (this.state.isEnhanced) {
          ctx.filter = "contrast(1.16) brightness(1.04) saturate(0.88)";
        }
        
        ctx.translate(-cb.x, -cb.y);
        ctx.translate(dims.w / 2, dims.h / 2);
        
        ctx.rotate((this.state.rotation * Math.PI) / 180);
        ctx.drawImage(this.state.rawImage, -this.state.rawImage.width/2, -this.state.rawImage.height/2);
        
        return outCanvas;
      }
  }

  window.LB = window.LB || {};
  window.LB.ScorecardEditor = ScorecardEditor;
})();
