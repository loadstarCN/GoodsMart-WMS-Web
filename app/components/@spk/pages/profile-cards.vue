<script lang="js">
export default {
    props: {
        customCardClass: String,
        cardBodyClass: String,
        avatarClass: String,
        imgSrc: String,
        name: String,
        email: String,
        badgeText: String,
        showButtons: { type: Boolean, default: true },
        cardFooterClass: String,
        nameClass: String,
        emailClass: String,
        badgeClass: String,
    }
}
</script>

<template>
    <div class="card custom-card" :class="customCardClass">
        <div class="card-body" :class="cardBodyClass">
            <div class="text-center">
                <span :class="avatarClass">
                    <img :src="imgSrc" alt="Avatar" />
                </span>
                <div class="mt-2">
                    <p :class="nameClass">{{ name }}</p>
                    <p :class="emailClass">{{ email }}</p>
                    <span :class="badgeClass">{{ badgeText }}</span>
                </div>
            </div>
        </div>
        <div class="card-footer" :class="cardFooterClass">
            <template v-if="showButtons">
                <div class="btn-list">
                    <button class="btn btn-sm btn-light btn-wave">Block</button>
                    <button class="btn btn-sm btn-primary btn-wave">Unfollow</button>
                </div>
            </template>
        </div>
    </div>
</template>

<style scoped></style>
