<template lang="">
    <CustomPageSwitcher/>
    <slot></slot>
    <BackToTop />
</template>
<script>

export default {    
    mounted() {
        document.body.classList.add('landing-body');
    },
    unmounted() {
        document.body.classList.remove('landing-body');
    },
};
</script>
<style lang=""></style>
