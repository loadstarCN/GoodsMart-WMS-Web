<script lang="ts">
interface Transaction {
    arrowTextColor: string;
    statusBadgeColor: string;
    statusBadgeText: string;
    receiver: string;
    amountColor: string;
    amount: string;
    date: string;
    coinName: string;
    coinSrc: string;
    transactionHash: string;
    senderName: string;
    sendersrc: any;
    arrowDirection: string;
}

export default {
    props: {
        transactionsData: {
            type: Array as () => Transaction[],
            required: true
        }
    },
    data() {
        return {
            searchTerm: ''  // Initialize searchTerm
        };
    },
    computed: {
        filteredTransactions() {
            return this.transactionsData.filter(transaction => {
                const searchLower = this.searchTerm.toLowerCase();
                return (
                    transaction.senderName.toLowerCase().includes(searchLower) ||
                    transaction.receiver.toLowerCase().includes(searchLower) ||
                    transaction.transactionHash.toLowerCase().includes(searchLower) ||
                    transaction.coinName.toLowerCase().includes(searchLower) ||
                    transaction.date.toLowerCase().includes(searchLower) ||
                    transaction.amount.toLowerCase().includes(searchLower)
                );
            });
        }
    },
    methods: {
        deleteTransaction(index: number) {
            this.transactionsData.splice(index, 1);
        }
    }
}
</script>

<template>
    <div class="card custom-card">
        <div class="card-header justify-content-between">
            <div class="card-title">Transaction History</div>
            <div class="d-flex flex-wrap gap-2">
                <div>
                    <input class="form-control form-control-sm" type="text" placeholder="Search Here"
                        aria-label="Search" v-model="searchTerm">
                </div>
                <div class="dropdown">
                    <a href="#" class="btn btn-primary btn-sm btn-wave waves-effect waves-light"
                        data-bs-toggle="dropdown" aria-expanded="false">
                        Sort By <i class="ri-arrow-down-s-line align-middle ms-1 d-inline-block"></i>
                    </a>
                    <ul class="dropdown-menu" role="menu">
                        <li><a class="dropdown-item" href="#">This Week</a></li>
                        <li><a class="dropdown-item" href="#">{{t('common.statistics.this-month')}}</a></li>
                        <li><a class="dropdown-item" href="#">This Year</a></li>
                    </ul>
                </div>
                <div>
                    <button class="btn btn-secondary btn-sm btn-wave">View All</button>
                </div>
            </div>
        </div>
        <div class="card-body">
            <div class="table-responsive">
                <table class="table text-nowrap table-bordered">
                    <thead>
                        <tr>
                            <th></th>
                            <th scope="col">Sender</th>
                            <th scope="col">Transaction Hash</th>
                            <th scope="col">Coin</th>
                            <th scope="col">Date</th>
                            <th scope="col">Amount</th>
                            <th scope="col">Receiver</th>
                            <th scope="col">{{ t('common.fields.status') }}</th>
                            <th scope="col">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(transaction, index) in filteredTransactions" :key="index">
                            <td>
                                <span class="avatar avatar-sm avatar-rounded bg-light">
                                    <i
                                        :class="`ti ti-arrow-narrow-${transaction.arrowDirection} text-${transaction.arrowTextColor} fw-semibold fs-16`"></i>
                                </span>
                            </td>
                            <td>
                                <div class="d-flex align-items-center gap-2">
                                    <span class="avatar avatar-xs avatar-rounded">
                                        <img :src="transaction.sendersrc" alt="Sender Image">
                                    </span>
                                    <div class="fw-semibold">{{ transaction.senderName }}</div>
                                </div>
                            </td>
                            <td>
                                <span>#{{ transaction.transactionHash }}</span>
                            </td>
                            <td>
                                <div class="d-flex align-items-center gap-2">
                                    <span class="avatar avatar-xs avatar-rounded">
                                        <img :src="transaction.coinSrc" alt="Coin Image">
                                    </span>
                                    <div class="fw-semibold">{{ transaction.coinName }}</div>
                                </div>
                            </td>
                            <td>
                                <span>{{ transaction.date }}</span>
                            </td>
                            <td>
                                <span :class="`text-${transaction.amountColor}`">{{ transaction.amount }}</span>
                            </td>
                            <td>
                                <span>{{ transaction.receiver }}</span>
                            </td>
                            <td>
                                <span :class="`badge bg-${transaction.statusBadgeColor}-transparent`">{{
                                    transaction.statusBadgeText }}</span>
                            </td>
                            <td>
                                <v-btn class="btn btn-primary-light btn-icon btn-sm">
                                    <i class="ri-download-2-line"></i>
                                    <v-tooltip activator="parent" location="top">
                                        Delete
                                    </v-tooltip>
                                </v-btn>
                                <v-btn class="btn-danger-light btn-icon ms-1 btn-sm" @click="deleteTransaction(index)">
                                    <i class="ri-delete-bin-5-line"></i>
                                    <v-tooltip activator="parent" location="top">
                                        Delete
                                    </v-tooltip>
                                </v-btn>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
        <div class="card-footer">
            <nav aria-label="Page navigation">
                <ul class="pagination mb-0 float-end">
                    <li class="page-item disabled">
                        <a class="page-link" href="#">Previous</a>
                    </li>
                    <li class="page-item"><a class="page-link" href="#">1</a></li>
                    <li class="page-item active" aria-current="page">
                        <a class="page-link" href="#">2</a>
                    </li>
                    <li class="page-item"><a class="page-link" href="#">3</a></li>
                    <li class="page-item">
                        <a class="page-link" href="#">Next</a>
                    </li>
                </ul>
            </nav>
        </div>
    </div>
</template>

<style scoped></style>
