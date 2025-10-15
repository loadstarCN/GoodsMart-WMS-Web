<script setup>
const error = useError(); // 使用 Nuxt 3 的 useError 获取错误信息
</script>

<template>
    <div class="page error-bg">
        <!-- Start::error-page -->
        <div class="error-page">
            <div class="container">
                <div class="text-center p-5 my-auto">
                    <div class="row align-items-center justify-content-center h-100">
                        <div class="col-xl-7">
                            <p class="error-text mb-sm-0 mb-2">{{ error?.statusCode }}</p>
                            <p class="fs-18 fw-semibold mb-3">{{ $t(`error.http-${error?.statusCode}.title`) }}
                            </p>
                            <div class="row justify-content-center mb-5">
                                <div class="col-xl-6">
                                    <p class="mb-0 op-7">{{ $t(`error.http-${error?.statusCode}.description`) }}</p>
                                </div>
                            </div>
                            <NuxtLink to='/' class="btn btn-primary"><i
                                    class="ri-arrow-left-line align-middle me-1"></i>{{ $t('button.back-to-home') }}
                            </NuxtLink>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped></style>
