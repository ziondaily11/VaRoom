/**
 * VaRoom Video Uploader Component
 *
 * Handles video selection, upload, progress, error handling, and playback.
 * Integrates with the property listing wizard.
 */

class VaRoomVideoUploader {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.options = {
      maxFileSize: 500 * 1024 * 1024, // 500MB
      allowedMimeTypes: ['video/mp4', 'video/quicktime'],
      onProgress: options.onProgress || (() => {}),
      onSuccess: options.onSuccess || (() => {}),
      onError: options.onError || (() => {}),
      propertyId: options.propertyId || null,
      accessToken: options.accessToken || null,
    };

    this.uploads = new Map(); // Track ongoing uploads
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="video-uploader">
        <div class="video-uploader-input-zone">
          <input 
            type="file" 
            id="video-file-input" 
            class="video-file-input" 
            accept="video/mp4,video/quicktime"
            style="display: none;"
          />
          <button 
            id="video-select-btn" 
            class="video-select-btn"
            type="button"
          >
            + Add Video
          </button>
          <p class="video-hint">MP4 or MOV, up to ${this.options.maxFileSize / 1024 / 1024 | 0}MB</p>
        </div>
        <div id="video-uploads-list" class="video-uploads-list"></div>
      </div>
    `;

    this.fileInput = this.container.querySelector('#video-file-input');
    this.selectBtn = this.container.querySelector('#video-select-btn');
    this.uploadsList = this.container.querySelector('#video-uploads-list');

    this.selectBtn.addEventListener('click', () => this.fileInput.click());
    this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
  }

  handleFileSelect(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      this.startUpload(file);
    }

    // Reset input so same file can be selected again
    this.fileInput.value = '';
  }

  async startUpload(file) {
    // Validation
    if (file.size > this.options.maxFileSize) {
      this.options.onError({
        fileName: file.name,
        error: `File exceeds maximum size of ${this.options.maxFileSize / 1024 / 1024 | 0}MB`,
      });
      return;
    }

    if (!this.options.allowedMimeTypes.includes(file.type)) {
      this.options.onError({
        fileName: file.name,
        error: `Format not supported. Please use MP4 or MOV.`,
      });
      return;
    }

    const uploadId = Math.random().toString(36).substr(2, 9);
    const uploadState = {
      id: uploadId,
      fileName: file.name,
      file: file,
      status: 'initializing', // initializing -> uploading -> verifying -> complete/failed
      progress: 0,
      error: null,
      mediaId: null,
      uploadAuthorization: null,
    };

    this.uploads.set(uploadId, uploadState);
    this.renderUploadItem(uploadId);

    try {
      // Step 1: Request upload authorization from backend
      const initResponse = await this.requestUploadInit(file.name, file.type, file.size);

      if (!initResponse.success) {
        throw new Error(initResponse.error || 'Upload initialization failed');
      }

      uploadState.mediaId = initResponse.mediaId;
      uploadState.uploadId = initResponse.uploadId;
      uploadState.uploadAuthorization = initResponse.uploadAuthorization;
      uploadState.status = 'uploading';
      this.renderUploadItem(uploadId);

      // Step 2: Upload directly to R2
      await this.uploadToR2(uploadId, file);

      // Step 3: Notify backend that upload is complete
      uploadState.status = 'verifying';
      this.renderUploadItem(uploadId);

      await this.notifyUploadComplete(uploadId);

      // Success
      uploadState.status = 'complete';
      uploadState.progress = 100;
      this.renderUploadItem(uploadId);

      this.options.onSuccess({
        mediaId: uploadState.mediaId,
        fileName: file.name,
        size: file.size,
      });

      // Auto-remove successful upload after 3 seconds
      setTimeout(() => {
        this.removeUploadItem(uploadId);
      }, 3000);
    } catch (error) {
      uploadState.status = 'failed';
      uploadState.error = error.message;
      this.renderUploadItem(uploadId);

      this.options.onError({
        fileName: file.name,
        error: error.message,
        mediaId: uploadState.mediaId,
      });
    }
  }

  async requestUploadInit(fileName, mimeType, fileSize) {
    const response = await fetch(
      `/api/properties/${this.options.propertyId}/videos/upload-init`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.options.accessToken}`,
        },
        body: JSON.stringify({
          filename: fileName,
          mimeType: mimeType,
          fileSize: fileSize,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Upload init failed');
    }

    return await response.json();
  }

  async uploadToR2(uploadId, file) {
    const uploadState = this.uploads.get(uploadId);
    const auth = uploadState.uploadAuthorization;

    // Use presigned POST or multipart upload
    // For MVP, construct a simple PUT request to R2 endpoint
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          uploadState.progress = Math.round((e.loaded / e.total) * 90); // 0-90% for upload
          this.options.onProgress({
            uploadId: uploadId,
            progress: uploadState.progress,
          });
          this.renderUploadItem(uploadId);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Upload failed: ${xhr.statusText}`));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Network error during upload'));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('Upload cancelled'));
      });

      // Construct R2 upload URL and headers
      const uploadUrl = `${auth.endpoint}/${auth.bucketName}/${auth.objectKey}`;

      xhr.open('PUT', uploadUrl, true);
      xhr.setRequestHeader('Content-Type', auth.contentType);

      // In production, add proper R2 authorization headers here
      // For now, assuming bucket has appropriate CORS/auth policy

      xhr.send(file);
    });
  }

  async notifyUploadComplete(uploadId) {
    const uploadState = this.uploads.get(uploadId);

    const response = await fetch(
      `/api/properties/${this.options.propertyId}/videos/${uploadState.mediaId}/complete`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.options.accessToken}`,
        },
        body: JSON.stringify({
          uploadId: uploadState.uploadId,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Upload completion failed');
    }

    return await response.json();
  }

  renderUploadItem(uploadId) {
    const uploadState = this.uploads.get(uploadId);
    if (!uploadState) return;

    let itemHtml = '';

    switch (uploadState.status) {
      case 'initializing':
        itemHtml = `
          <div class="upload-item status-initializing">
            <div class="upload-icon">📹</div>
            <div class="upload-details">
              <div class="upload-name">${uploadState.fileName}</div>
              <div class="upload-status">Preparing upload...</div>
            </div>
          </div>
        `;
        break;

      case 'uploading':
        itemHtml = `
          <div class="upload-item status-uploading">
            <div class="upload-icon">📹</div>
            <div class="upload-details">
              <div class="upload-name">${uploadState.fileName}</div>
              <div class="upload-progress">
                <div class="progress-bar">
                  <div class="progress-fill" style="width: ${uploadState.progress}%"></div>
                </div>
                <div class="progress-text">${uploadState.progress}%</div>
              </div>
            </div>
            <button class="upload-cancel-btn" data-upload-id="${uploadId}" type="button">✕</button>
          </div>
        `;
        break;

      case 'verifying':
        itemHtml = `
          <div class="upload-item status-verifying">
            <div class="upload-icon">⏳</div>
            <div class="upload-details">
              <div class="upload-name">${uploadState.fileName}</div>
              <div class="upload-status">Verifying upload...</div>
            </div>
          </div>
        `;
        break;

      case 'complete':
        itemHtml = `
          <div class="upload-item status-complete">
            <div class="upload-icon">✓</div>
            <div class="upload-details">
              <div class="upload-name">${uploadState.fileName}</div>
              <div class="upload-status">Upload complete</div>
            </div>
            <button class="upload-remove-btn" data-upload-id="${uploadId}" type="button">Remove</button>
          </div>
        `;
        break;

      case 'failed':
        itemHtml = `
          <div class="upload-item status-failed">
            <div class="upload-icon">⚠</div>
            <div class="upload-details">
              <div class="upload-name">${uploadState.fileName}</div>
              <div class="upload-error">${uploadState.error}</div>
            </div>
            <div class="upload-actions">
              <button class="upload-retry-btn" data-upload-id="${uploadId}" type="button">Retry</button>
              <button class="upload-remove-btn" data-upload-id="${uploadId}" type="button">Remove</button>
            </div>
          </div>
        `;
        break;
    }

    let existingItem = this.uploadsList.querySelector(`[data-upload-id="${uploadId}"]`);
    if (!existingItem) {
      const wrapper = document.createElement('div');
      wrapper.setAttribute('data-upload-id', uploadId);
      wrapper.innerHTML = itemHtml;
      this.uploadsList.appendChild(wrapper);
      existingItem = wrapper;
    } else {
      existingItem.innerHTML = itemHtml;
    }

    // Attach event listeners
    const retryBtn = existingItem.querySelector('.upload-retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        const state = this.uploads.get(uploadId);
        if (state && state.file) {
          this.removeUploadItem(uploadId);
          this.startUpload(state.file);
        }
      });
    }

    const removeBtn = existingItem.querySelector('.upload-remove-btn');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        this.removeUploadItem(uploadId);
      });
    }

    const cancelBtn = existingItem.querySelector('.upload-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        // TODO: Implement abort controller for in-progress uploads
        this.removeUploadItem(uploadId);
      });
    }
  }

  removeUploadItem(uploadId) {
    const item = this.uploadsList.querySelector(`[data-upload-id="${uploadId}"]`);
    if (item) {
      item.remove();
    }
    this.uploads.delete(uploadId);
  }

  getUploadedMediaIds() {
    const mediaIds = [];
    for (const [, state] of this.uploads) {
      if (state.status === 'complete' && state.mediaId) {
        mediaIds.push(state.mediaId);
      }
    }
    return mediaIds;
  }
}

// Export for use in list.html
if (typeof window !== 'undefined') {
  window.VaRoomVideoUploader = VaRoomVideoUploader;
}
