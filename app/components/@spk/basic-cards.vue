<script lang="js">
export default {
    props: {
        cardClass: String,
        cardBodyClass: String,
        showCardBody: { type: Boolean, default: false },
        showCradFooter: { type: Boolean, default: false }
    }
}
</script>
<template>
    <div :class="['card', cardClass]">
        <slot name="card"></slot>
        <template v-if="showCardBody">
            <div :class="['card-body', cardBodyClass]">
                <slot name="cardBody"></slot>
            </div>
        </template>
        <slot name="cardBodyDown"></slot>
        <template v-if="showCradFooter">
            <div class="card-footer">
                <slot name="cardFooter"></slot>
            </div>
        </template>
    </div>
</template>
<style scoped></style>