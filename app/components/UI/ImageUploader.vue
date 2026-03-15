<script lang="ts" setup>
/**
 * ImageUploader - Compact image upload component with preview
 *
 * Usage:
 *   <ImageUploader v-model="itemData.avatar" upload-url="/api/warehouse/staff/image/upload" />
 *   <ImageUploader v-model="itemData.logo" upload-url="/api/warehouse/company/image/upload" shape="square" :size="120" />
 *   <ImageUploader v-model="itemData.image_url" upload-url="/api/warehouse/goods/image/upload" shape="square" :size="160" />
 */

const { t } = useI18n()

const props = withDefaults(defineProps<{
  modelValue: string | null          // The image URL (v-model)
  uploadUrl: string                  // Backend upload API path
  shape?: 'circle' | 'square'       // Preview shape
  size?: number                      // Preview size in px
  accept?: string                    // Accepted file types
  maxSize?: number                   // Max file size in bytes (default 5MB)
  fallbackSrc?: string               // Fallback image when no image
}>(), {
  shape: 'circle',
  size: 100,
  accept: 'image/png,image/jpeg,image/webp',
  maxSize: 5 * 1024 * 1024,
  fallbackSrc: '/images/goods/default.png',
})

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
}>()

const inputId = `img-upload-${useId()}`
const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const previewUrl = ref<string | null>(null) // Local preview before upload completes
const dragOver = ref(false)
const imgLoadError = ref(false) // Track if the remote image failed to load

// Displayed image: local preview > uploaded URL (if not broken) > fallback
const displaySrc = computed(() => {
  if (previewUrl.value) return previewUrl.value
  if (props.modelValue && !imgLoadError.value) return props.modelValue
  return props.fallbackSrc
})
const hasImage = computed(() => !!(previewUrl.value || (props.modelValue && !imgLoadError.value)))

// Reset error state when modelValue changes (e.g. after new upload)
watch(() => props.modelValue, () => {
  imgLoadError.value = false
})

const handleImgError = () => {
  imgLoadError.value = true
}

const triggerSelect = () => {
  if (!uploading.value) {
    fileInput.value?.click()
  }
}

const handleFileChange = (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    processFile(file)
  }
  // Reset input so selecting the same file again triggers change
  input.value = ''
}

const handleDrop = (e: DragEvent) => {
  dragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) {
    processFile(file)
  }
}

const processFile = async (file: File) => {
  // Validate type
  const acceptedTypes = props.accept.split(',').map(s => s.trim())
  if (!acceptedTypes.includes(file.type)) {
    showToast(t('upload.upload-image-type-error', 'Only PNG, JPEG and WebP files are allowed'), 'error')
    return
  }

  // Validate size
  if (file.size > props.maxSize) {
    const maxMB = (props.maxSize / 1024 / 1024).toFixed(0)
    showToast(t('upload.upload-image-size-error', `File size must be less than ${maxMB}MB`), 'error')
    return
  }

  // Show local preview immediately
  previewUrl.value = URL.createObjectURL(file)

  // Upload
  uploading.value = true
  const formData = new FormData()
  formData.append('file', file, file.name)

  await httpRequest(props.uploadUrl, {
    method: 'POST',
    body: formData,
    onSuccess: (data: any) => {
      const fileUrl = data?.file_url
      if (!fileUrl) return
      // Preload the remote image before switching from local preview
      const img = new Image()
      img.onload = () => {
        emit('update:modelValue', fileUrl)
        if (previewUrl.value) {
          URL.revokeObjectURL(previewUrl.value)
          previewUrl.value = null
        }
      }
      img.onerror = () => {
        // Still update the model value, but keep showing preview
        emit('update:modelValue', fileUrl)
      }
      img.src = fileUrl
    },
    onError: (error: any) => {
      showToast(error.message || t('upload.upload-image-failed', 'Upload failed'), 'error')
      // Revert preview
      if (previewUrl.value) {
        URL.revokeObjectURL(previewUrl.value)
        previewUrl.value = null
      }
    },
    onFinally: () => {
      uploading.value = false
    }
  })
}

const removeImage = () => {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = null
  }
  emit('update:modelValue', null)
}

// Clean up on unmount
onUnmounted(() => {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
  }
})
</script>

<template>
  <div class="image-uploader">
    <label
      :for="uploading ? undefined : inputId"
      class="image-uploader__preview"
      :class="[
        `image-uploader__preview--${shape}`,
        { 'image-uploader__preview--dragover': dragOver }
      ]"
      :style="{ width: `${size}px`, height: `${size}px` }"
      @dragover.prevent="dragOver = true"
      @dragleave.prevent="dragOver = false"
      @drop.prevent="handleDrop"
    >
      <img :src="displaySrc" :alt="t('common.fields.image', 'Image')" class="image-uploader__img" @error="handleImgError" />

      <!-- Overlay -->
      <div class="image-uploader__overlay">
        <span v-if="uploading" class="spinner-border spinner-border-sm text-white"></span>
        <i v-else class="ri-camera-line text-white fs-20"></i>
      </div>

      <!-- Remove button -->
      <button
        v-if="hasImage && !uploading"
        type="button"
        class="image-uploader__remove"
        @click.stop.prevent="removeImage"
        :title="t('button.delete', 'Remove')"
      >
        <i class="ri-close-line"></i>
      </button>
    </label>

    <input
      :id="inputId"
      ref="fileInput"
      type="file"
      :accept="accept"
      class="image-uploader__input"
      @change="handleFileChange"
    />

    <div class="image-uploader__hint text-muted fs-12 mt-1" :style="{ maxWidth: `${size}px` }">
      {{ t('upload.image-uploader-hint', 'Click or drag to upload') }}
    </div>
  </div>
</template>

<style scoped>
.image-uploader {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
}

.image-uploader__preview {
  position: relative;
  overflow: hidden;
  cursor: pointer;
  border: 2px dashed var(--default-border);
  background: var(--custom-white, #f8f9fa);
  transition: border-color 0.2s, box-shadow 0.2s;
}

.image-uploader__preview:hover {
  border-color: var(--primary-color, #5c67f7);
  box-shadow: 0 0 0 3px rgba(92, 103, 247, 0.1);
}

.image-uploader__preview--dragover {
  border-color: var(--primary-color, #5c67f7);
  box-shadow: 0 0 0 4px rgba(92, 103, 247, 0.15);
}

.image-uploader__preview--circle {
  border-radius: 50%;
}

.image-uploader__preview--square {
  border-radius: 8px;
}

.image-uploader__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.image-uploader__overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
  opacity: 0;
  transition: opacity 0.2s;
}

.image-uploader__preview:hover .image-uploader__overlay {
  opacity: 1;
}

.image-uploader__remove {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 50%;
  background: rgba(220, 53, 69, 0.85);
  color: #fff;
  font-size: 14px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
  padding: 0;
}

.image-uploader__preview:hover .image-uploader__remove {
  opacity: 1;
}

.image-uploader__remove:hover {
  background: rgba(220, 53, 69, 1);
}

.image-uploader__input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.image-uploader__hint {
  text-align: center;
}
</style>
