<script lang="ts">
interface Companies {
    contactSrc: any;
    contactName: string;
    leadScore: number;
    email: string;
    phoneNumber: string;
    companyLogo: any;
    companyName: string;
    Industry: string;
    tagBadgeColor1: string;
    tagBadgesText1: string;
}

export default {
    props: {
        crmCompaniesData: {
            type: Array as () => Companies[],
            required: true,
        },
    },
    methods: {
        deleteCompany(index: number) {
            this.crmCompaniesData.splice(index, 1);
        },
    }
}
</script>


<template>
    <div class="card custom-card">
        <div class="card-header d-flex justify-content-between">
            <div class="card-title">
                Companies <span class="badge bg-light text-default rounded ms-1 fs-12">23</span>
            </div>
            <div class="d-flex flex-wrap gap-2">
                <button class="btn btn-primary btn-sm btn-wave" data-bs-toggle="modal" data-bs-target="#create-contact">
                    <i class="ri-add-line me-1 fw-semibold"></i>Add Company
                </button>
                <button class="btn btn-success-light btn-sm btn-wave">Export As CSV</button>
                <div class="dropdown">
                    <button class="btn btn-light btn-sm btn-wave" data-bs-toggle="dropdown" aria-expanded="false">
                        Sort By <i class="ri-arrow-down-s-line align-middle ms-1"></i>
                    </button>
                    <ul class="dropdown-menu">
                        <li><a class="dropdown-item" href="#">Newest</a></li>
                        <li><a class="dropdown-item" href="#">Date Added</a></li>
                        <li><a class="dropdown-item" href="#">A - Z</a></li>
                    </ul>
                </div>
            </div>
        </div>

        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table text-nowrap">
                    <thead>
                        <tr>
                            <th>
                                <input class="form-check-input" type="checkbox" aria-label="Select all contacts">
                            </th>
                            <th>Company Name</th>
                            <th>Email</th>
                            <th>Phone</th>
                            <th>Industry</th>
                            <th>Company Size</th>
                            <th>Key Contact</th>
                            <th>Total Deals</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(contact, index) in crmCompaniesData" :key="index">
                            <td>
                                <input class="form-check-input" type="checkbox"
                                    aria-label="Select contact {{ contact.companyName }}">
                            </td>
                            <td>
                                <div class="d-flex align-items-center gap-2">
                                    <span class="avatar avatar-sm p-1 bg-light avatar-rounded">
                                        <img :src="contact.companyLogo" alt="Logo of {{ contact.companyName }}">
                                    </span>
                                    <a data-bs-toggle="offcanvas" href="#offcanvasExample" role="button"
                                        aria-controls="offcanvasExample">
                                        {{ contact.companyName }}
                                    </a>
                                </div>
                            </td>
                            <td>
                                <span class="d-block mb-1"><i
                                        class="ri-mail-line me-2 align-middle fs-14 text-muted"></i>{{
                                            contact.email }}</span>
                            </td>
                            <td>
                                <span><i class="ri-phone-line me-2 align-middle fs-14 text-muted"></i>{{
                                    contact.phoneNumber
                                    }}</span>
                            </td>
                            <td>{{ contact.Industry }}</td>
                            <td>
                                <span :class="`badge bg-${contact.tagBadgeColor1}`">{{ contact.tagBadgesText1 }}</span>
                            </td>
                            <td>
                                <div class="d-flex align-items-center gap-2">
                                    <span class="avatar avatar-rounded avatar-sm">
                                        <img :src="contact.contactSrc" alt="Contact: {{ contact.contactName }}">
                                    </span>
                                    <span class="fw-semibold">{{ contact.contactName }}</span>
                                </div>
                            </td>
                            <td>{{ contact.leadScore }}</td>
                            <td>
                                <div class="btn-list">
                                    <a data-bs-toggle="offcanvas" href="#offcanvasExample" role="button"
                                        aria-controls="offcanvasExample" class="btn btn-sm btn-warning-light btn-icon">
                                        <i class="ri-eye-line"></i>
                                    </a>
                                    <button class="btn btn-sm btn-info-light btn-icon">
                                        <i class="ri-pencil-line"></i>
                                    </button>
                                    <button class="btn btn-sm btn-danger-light btn-icon" @click="deleteCompany(index)">
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
                    <nav aria-label="Page navigation">
                        <ul class="pagination mb-0">
                            <li class="page-item disabled">
                                <a class="page-link" href="#">Prev</a>
                            </li>
                            <li class="page-item active"><a class="page-link" href="#">1</a></li>
                            <li class="page-item"><a class="page-link" href="#">2</a></li>
                            <li class="page-item">
                                <a class="page-link text-primary" href="#">Next</a>
                            </li>
                        </ul>
                    </nav>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped></style>
