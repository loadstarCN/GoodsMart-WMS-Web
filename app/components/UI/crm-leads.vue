<script lang="ts">
interface Lead {
    contactSrc: any;
    contactName: string;
    contactTime: string;
    leadStatus: string;
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
        crmLeadData: {
            type: Array as () => Lead[],
            required: true,
        },
    },
    methods: {
        deleteLead(index: number) {
            this.crmLeadData.splice(index, 1);
        },
    }
}
</script>

<template>
    <div class="card custom-card">
        <div class="card-header d-flex align-items-center justify-content-between flex-wrap gap-3">
            <div class="card-title">
                Leads<span class="badge bg-light text-default rounded ms-1 fs-12 align-middle">30</span>
            </div>
            <div class="d-flex flex-wrap gap-2">
                <button class="btn btn-primary btn-sm" data-bs-toggle="modal" data-bs-target="#create-contact"><i
                        class="ri-add-line me-1 fw-semibold align-middle"></i>Create Lead</button>
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
                            <th scope="col">Email</th>
                            <th scope="col">Phone</th>
                            <th scope="col">Lead {{ t('common.fields.status') }}</th>
                            <th scope="col">Company</th>
                            <th scope="col">Lead Source</th>
                            <th scope="col">Tags</th>
                            <th scope="col">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr class="crm-contact" v-for="(value, key) in crmLeadData" :key="key">
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
                                        <span class="d-block fw-semibold">{{ value.contactName }}</span>
                                    </div>
                                </div>
                            </td>
                            <td>
                                <div>
                                    <span class="d-block mb-1"><i
                                            class="ri-mail-line me-2 align-middle fs-14 text-muted d-inline-block"></i>{{
                                                value.email }}</span>
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
                                <span class="badge bg-light text-default">{{ value.leadStatus }}</span>
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
                            <td>
                                {{ value.leadSource }}
                            </td>
                            <td>
                                <div class="d-flex align-items-center flex-wrap gap-1">
                                    <span :class="`badge bg-${value.tagBadgeColor1}`">{{ value.tagBadgesText1 }}</span>
                                    <span :class="`badge bg-${value.tagBadgeColor2}`">{{ value.tagBadgesText2 }}</span>
                                </div>
                            </td>
                            <td>
                                <div class="btn-list">
                                    <a class="btn btn-sm btn-warning-light btn-icon"><i class="ri-eye-line"></i></a>
                                    <button class="btn btn-sm btn-info-light btn-icon"><i
                                            class="ri-pencil-line"></i></button>
                                    <button class="btn btn-sm btn-danger-light btn-icon" @click="deleteLead(key)">
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
                    Showing 10 Entries <i class="bi bi-arrow-right ms-2 fw-semibold"></i>
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
                                <a class="page-link text-primary" href="javascript:void(0);">Next</a>
                            </li>
                        </ul>
                    </nav>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped></style>
