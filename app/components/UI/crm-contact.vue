<script lang="ts">
interface Contact {
    contactSrc: any;
    contactName: string;
    contactTime: string;
    leadScore: number;
    email: string;
    phoneNumber: string;
    companyLogo: any;
    companyName: string;
    leadSource: string;
    tagBadgeColor1: string;
    tagBadgesText1: string;
    tagBadgeColor2: string;
    tagBadgesText2: string;
}

export default {
    props: {
        crmContactsData: {
            type: Array as () => Contact[],
            required: true
        }
    },
    methods: {
        deleteContact(key: number) {
            this.$emit('delete-contact', key);
        }
    }
}
</script>

<template>
    <div class="card custom-card">
        <div class="card-header d-flex align-items-center justify-content-between flex-wrap gap-3">
            <div class="card-title">
                Contacts<span class="badge bg-light text-default rounded ms-1 fs-12 align-middle">{{
                    crmContactsData.length
                    }}</span>
            </div>
            <div class="d-flex flex-wrap gap-2">
                <button class="btn btn-primary btn-sm" data-bs-toggle="modal" data-bs-target="#create-contact">
                    <i class="ri-add-line me-1 fw-semibold align-middle"></i>Create Contact
                </button>
                <button class="btn btn-success-light btn-sm">Export As CSV</button>
                <div class="dropdown">
                    <a href="javascript:void(0);" class="btn btn-light btn-sm btn-wave waves-effect waves-light"
                        data-bs-toggle="dropdown" aria-expanded="false">
                        Sort By<i class="ri-arrow-down-s-line align-middle ms-1 d-inline-block"></i>
                    </a>
                    <ul class="dropdown-menu" role="menu">
                        <li><a class="dropdown-item" href="javascript:void(0);">Newest</a></li>
                        <li><a class="dropdown-item" href="javascript:void(0);">Date Added</a></li>
                        <li><a class="dropdown-item" href="javascript:void(0);">A - Z</a></li>
                    </ul>
                </div>
            </div>
        </div>
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table text-nowrap">
                    <thead>
                        <tr>
                            <th scope="col">
                                <input class="form-check-input" type="checkbox" id="checkboxNoLabel" value=""
                                    aria-label="...">
                            </th>
                            <th scope="col">Contact Name</th>
                            <th scope="col">Lead Score</th>
                            <th scope="col">Email</th>
                            <th scope="col">Phone</th>
                            <th scope="col">Company</th>
                            <th scope="col">Lead Source</th>
                            <th scope="col">Tags</th>
                            <th scope="col">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr class="crm-contact" v-for="(value, key) in crmContactsData" :key="key">
                            <td>
                                <input class="form-check-input" type="checkbox" id="checkboxNoLabel1" value=""
                                    aria-label="...">
                            </td>
                            <td>
                                <div class="d-flex align-items-center gap-2">
                                    <div class="lh-1">
                                        <span class="avatar avatar-rounded avatar-sm">
                                            <img :src="value.contactSrc" alt="">
                                        </span>
                                    </div>
                                    <div>
                                        <a data-bs-toggle="offcanvas" href="#offcanvasExample" role="button"
                                            aria-controls="offcanvasExample">
                                            <span class="d-block fw-semibold">{{ value.contactName }}</span>
                                        </a>
                                        <span class="d-block text-muted fs-11" data-bs-toggle="tooltip"
                                            data-bs-custom-class="tooltip-primary" title="Last Contacted">
                                            <i class="ri-account-circle-line me-1 fs-13 align-middle"></i>{{
                                                value.contactTime }}
                                        </span>
                                    </div>
                                </div>
                            </td>
                            <td>{{ value.leadScore }}</td>
                            <td>
                                <div>
                                    <span class="d-block mb-1"><i
                                            class="ri-mail-line me-2 align-middle fs-14 text-muted"></i>{{ value.email
                                            }}</span>
                                </div>
                            </td>
                            <td>
                                <div>
                                    <span class="d-block"><i
                                            class="ri-phone-line me-2 align-middle fs-14 text-muted"></i>{{
                                                value.phoneNumber }}</span>
                                </div>
                            </td>
                            <td>
                                <div class="d-flex align-items-center gap-2">
                                    <div class="lh-1">
                                        <span class="avatar avatar-sm p-1 bg-light avatar-rounded">
                                            <img :src="value.companyLogo" alt="">
                                        </span>
                                    </div>
                                    <div>{{ value.companyName }}</div>
                                </div>
                            </td>
                            <td>{{ value.leadSource }}</td>
                            <td>
                                <div class="d-flex align-items-center flex-wrap gap-1">
                                    <span :class="`badge bg-${value.tagBadgeColor1}`">{{ value.tagBadgesText1 }}</span>
                                    <span :class="`badge bg-${value.tagBadgeColor2}`">{{ value.tagBadgesText2 }}</span>
                                </div>
                            </td>
                            <td>
                                <div class="btn-list">
                                    <a data-bs-toggle="offcanvas" href="#offcanvasExample" role="button"
                                        aria-controls="offcanvasExample" class="btn btn-sm btn-warning-light btn-icon">
                                        <i class="ri-eye-line"></i>
                                    </a>
                                    <button class="btn btn-sm btn-info-light btn-icon">
                                        <i class="ri-pencil-line"></i>
                                    </button>
                                    <button class="btn btn-sm btn-danger-light btn-icon contact-delete"
                                        @click="deleteContact(key)">
                                        <i class="ri-delete-bin-line"></i>
                                    </button>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
        <div class="card-footer border-top-0">
            <div class="d-flex align-items-center">
                <div>
                    Showing {{ crmContactsData.length }} Entries <i class="bi bi-arrow-right ms-2 fw-semibold"></i>
                </div>
                <div class="ms-auto">
                    <nav aria-label="Page navigation" class="pagination-style-4">
                        <ul class="pagination mb-0">
                            <li class="page-item disabled">
                                <a class="page-link" href="javascript:void(0);">Prev</a>
                            </li>
                            <li class="page-item active"><a class="page-link" href="javascript:void(0);">1</a></li>
                            <li class="page-item"><a class="page-link" href="javascript:void(0);">2</a></li>
                            <li class="page-item">
                                <a class="page-link text-primary" href="javascript:void(0);">next</a>
                            </li>
                        </ul>
                    </nav>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped></style>
