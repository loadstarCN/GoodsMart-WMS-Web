<script lang="js">
export default {
    props: {
        activity: {
            type: Object,
            required: true
        }
    }
}
</script>

<template>
    <div>
        <span v-if="activity.img" class="avatar avatar-sm avatar-rounded profile-timeline-avatar">
            <img :src="activity.img" alt="">
        </span>
        <span v-if="activity.avatar"
            :class="`avatar avatar-sm bg-${activity.avatarColor}-transparent avatar-rounded profile-timeline-avatar`">
            {{ activity.avatar }}
        </span>
        <div v-html="activity.description"></div>
        <p v-if="activity.media.length" class="profile-activity-media mb-2">
            <a href="javascript:void(0);" v-for="(media, key) of activity.media" :key="key">
                <img :src="media.img" :alt="media.name">
                <span v-if="media.Size" class="fs-11 text-muted">432.87KB</span>
            </a>
        </p>
        <div v-if="activity.avatarList.length">
            <div class="avatar-list-stacked">
                <span class="avatar avatar-sm avatar-rounded mt-1" v-for="(avatar, key) of activity.avatarList">
                    <img :src="avatar.img" :alt="avatar.name">
                </span>
            </div>
        </div>
    </div>
</template>

<style scoped></style>
