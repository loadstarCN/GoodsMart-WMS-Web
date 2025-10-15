<script lang="ts">

import { Swiper, SwiperSlide } from "swiper/vue";
import "swiper/swiper-bundle.css";
import { Autoplay, Navigation, Pagination, Scrollbar, Mousewheel, Keyboard, EffectCube, EffectFade, EffectCoverflow, EffectFlip, FreeMode, Thumbs } from 'swiper/modules';

export default {
    setup() {
        const thumbsSwiper = ref(null);

        const setThumbsSwiper = (swiper: any) => {
            thumbsSwiper.value = swiper;
        };

        const swiperItems = ref([]);

        const customPagination = {
            clickable: true,
            renderBullet: function (index: number, className: string) {
                return `<span class="${className}">${index + 1}</span>`;
            }
        };

        const swiperClass = '';
        const styleValue = '';
        const swiperSildeClass = '';

        return {
            thumbsSwiper,
            setThumbsSwiper,
            swiperItems,
            swiperClass,
            swiperSildeClass,
            customPagination,
            styleValue,
            modules: [
                Autoplay,
                Navigation,
                Pagination,
                Scrollbar,
                Mousewheel,
                Keyboard,
                EffectCube,
                EffectFade,
                EffectCoverflow,
                EffectFlip,
                FreeMode,
                Thumbs
            ],
        };
    },
    components: {
        Swiper,
        SwiperSlide,
    },
    props: {
        swiperItems: { type: Array, default: () => { } },
        swiperClass: String,
        swiperSildeClass: String,
    }
};
</script>

<template>
    <swiper :class="swiperClass" :pagination="customPagination" :navigation="true" :modules="modules">
        <swiper-slide v-for="(item, index) in swiperItems" :key="index" :class="swiperSildeClass">
            <slot :card="item" :index="index"></slot>
        </swiper-slide>
    </swiper>
</template>

<style scoped></style>
