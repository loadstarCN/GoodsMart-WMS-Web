<script lang="js">
export default {
    props: {
        customCardClass: String,
        cardBodyClass: String,
        card: { type: Object, required: true },
        showButton: { type: Boolean, default: true }

    },
}
</script>

<template>
    <div :class="['card custom-card', customCardClass]">
        <img :src="card.image" class="card-img-top" alt="NFT image">
        <div class="d-flex align-items-center justify-content-between nft-like-section w-100 px-3">
            <div class="flex-fill">
                <button class="btn btn-sm btn-icon btn-success rounded-pill btn-wave">
                    <i class="ri-heart-fill"></i>
                </button>
            </div>
            <div>
                <span class="badge nft-like-badge text-fixed-white">
                    <i class="ri-heart-fill me-1 text-danger align-middle d-inline-block"></i>{{ card.likes }}
                </span>
            </div>
        </div>
        <div :class="['card-body', cardBodyClass]">
            <div class="d-flex align-items-center mb-3">
                <div class="me-2 lh-1">
                    <span class="avatar avatar-rounded avatar-md">
                        <img :src="card.creatorImage" alt="Creator image">
                    </span>
                </div>
                <div>
                    <p class="mb-0 fw-semibold">{{ card.creatorName }}</p>
                    <p class="fs-12 text-muted mb-0">{{ card.creatorUsername }}</p>
                </div>
            </div>
            <p class="mb-0 text-fixed-white nft-auction-time">{{ card.auctionTime }}</p>
            <p class="fs-15 fw-semibold mb-2">{{ card.title }}</p>
            <div class="d-flex flex-wrap align-items-center justify-content-between">
                <div class="fw-semibold">
                    Highest Bid -
                </div>
                <div class="d-flex flex-wrap align-items-center lh-1">
                    <span class="avatar avatar-xs me-1">
                        <img :src="card.coinImage" alt="Coin image">
                    </span>{{ card.highestBid }}
                </div>
            </div>
            <div class="d-grid mt-4" v-if="showButton">
                <button class="btn btn-primary-light btn-wave">Place Bid</button>
            </div>
        </div>
    </div>
</template>

<style scoped></style>
