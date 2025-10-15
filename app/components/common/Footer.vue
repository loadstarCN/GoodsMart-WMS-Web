<template lang="">
    <!-- Footer Start -->
    <footer class="footer mt-auto py-3 bg-white text-center">
            <div class="container">
                <span class="text-muted" v-html="
                $t('footer.copyright', {
                    year: new Date().getFullYear(),
                    company: `<span class='text-dark fw-semibold'>${$t('footer.company')}</span>`,
                    developer: `<span class='fw-semibold text-primary text-decoration-underline'>${$t('footer.developer')}</span>`
                })
                "></span>  
            </div>
        </footer>
        <!-- Footer End -->
</template>
<script>
export default {
    
}
</script>
<style lang=""></style>