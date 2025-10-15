export let basicTable = {
    script: `&lt;TableComponent :headers="['Name', 'Created On', 'Number', 'Status']" :rows="tableData.basicRows" tableClass="table text-nowrap" v-slot:cell="{ row }">
    &lt;td>{{ row.name }}&lt;/td>
    &lt;td>{{ row.createdOn }}&lt;/td>
    &lt;td>{{ row.number }}&lt;/td>
    &lt;td>&lt;span :class='badge &#36;{row.color}'>{{ row.status }}&lt;/span>&lt;/td>
&lt;/TableComponent>`
},
    BorderedTables = {
        script: `
    &lt;TableComponent :headers="['User', 'Status', 'Email', 'Action']" :rows="tableData.bordered" tableClass="table text-nowrap table-bordered" v-slot:cell="{ row }">
        &lt;th>
            &lt;div class="d-flex align-items-center">
                &lt;span class="avatar avatar-xs me-2 online avatar-rounded">&lt;img :src="(row.avatar)" alt="img">&lt;/span>{{ row.name }}
           &lt;/div>
        &lt;/th>
        &lt;td>&lt;span :class="badge bg-&#36;{row.color} text-&#36;{row.textColor}">{{ row.status }}&lt;/span>&lt;/td>
        &lt;td>{{ row.email }}&lt;/td>
        &lt;td>
            &lt;div class="hstack gap-2 flex-wrap">
                &lt;a href="javascript:void(0);" class="text-info fs-14 lh-1">&lt;i class="ri-edit-line">&lt;/i>&lt;/a>
                &lt;a href="javascript:void(0);" class="text-danger fs-14 lh-1">&lt;i class="ri-delete-bin-5-line">&lt;/i>&lt;/a>
            &lt;/div>
        &lt;/td>
    &lt;/TableComponent>`
    },
    BorderedPrimary = {
        script: `&lt;TableComponent :headers="['Order', 'Date', 'Customer', 'Action']" :rows="tableData.borderedPrimary" tableClass="table text-nowrap table-bordered border-primary" v-slot:cell="{ row }">
    &lt;td>{{ row.id }}&lt;/td>
    &lt;td>&lt;span class="badge bg-light text-dark">{{ row.date }}&lt;/span>&lt;/td>
    &lt;td>
        &lt;div class="d-flex align-items-center">
            &lt;span class="avatar avatar-xs me-2 online avatar-rounded">
                &lt;img :src="(row.avatar)" alt="img">
            &lt;/span>{{ row.name }}
        &lt;/div>
    &lt;/td>
    &lt;td>&lt;span class="badge bg-primary-transparent">{{ row.status }}&lt;/span>&lt;/td>
&lt;/TableComponent>`
    },
    BorderedSuccess = {
        script: `&lt;TableComponent :headers="['Order', 'Date', 'Customer', 'Action']" :rows="tableData.borderedSuccess" tableClass="table text-nowrap table-bordered border-success" v-slot:cell="{ row }">
    &lt;td>{{ row.id }}&lt;/td>
    &lt;td>&lt;span class="badge bg-light text-dark">{{ row.date }}&lt;/span>&lt;/td>
    &lt;td>
        &lt;div class="d-flex align-items-center">
            &lt;span class="avatar avatar-xs me-2 online avatar-rounded">
                &lt;img :src="(row.avatar)" alt="img">
            &lt;/span>{{ row.name }}
        &lt;/div>
    &lt;/td>
    &lt;td>&lt;span class="badge bg-primary-transparent">{{ row.status }}&lt;/span>&lt;/td>
&lt;/TableComponent>`
    },
    BorderedWarning = {
        script: `&lt;TableComponent :headers="['Order', 'Date', 'Customer', 'Action']" :rows="tableData.borderedWarning" tableClass="table text-nowrap table-bordered border-warning" v-slot:cell="{ row }">
    &lt;td>{{ row.id }}&lt;/td>
    &lt;td>&lt;span class="badge bg-light text-dark">{{ row.date }}&lt;/span>&lt;/td>
    &lt;td>
        &lt;div class="d-flex align-items-center">
            &lt;span class="avatar avatar-xs me-2 online avatar-rounded">
                &lt;img :src="(row.avatar)" alt="img">
            &lt;/span>{{ row.name }}
        &lt;/div>
    &lt;/td>
    &lt;td>&lt;span class="badge bg-primary-transparent">{{ row.status }}&lt;/span>&lt;/td>
&lt;/TableComponent>`
    },
    TableWithoutBorders = {
        script: `&lt;TableComponent :headers="['User Name', 'Transaction Id', 'Created', 'Status']" :rows="tableData.withourBorder" tableClass="table text-nowrap table-borderless" v-slot:cell="{ row }">
    &lt;td>{{ row.name }}&lt;/td>
    &lt;td>{{ row.ticketId }}&lt;/td>
    &lt;td>{{ row.date }}&lt;/td>
    &lt;td>&lt;span :class="badge &#36{row.badgeClass}">{{ row.status }}&lt;/span>&lt;/td>
&lt;/TableComponent>`
    },
    TableGroupDivideres = {
        script: `&lt;TableComponent :headers="['Product', 'Seller', 'Sale Percentage', 'Quantity Sold']" :rows="tableData.groupDivideres" tableClass="table text-nowrap" v-slot:cell="{ row }">
    &lt;td>{{ row.name }&lt;/td>
    &lt;td>{{ row.brand }&lt;/td>
    &lt;td>
       &lt;a href="javascript:void(0);" :class="text-&#36{row.color}">{{ row.percentage }}
          &lt;i :class="ri-arrow-&#36;{row.dir}-fill ms-1">&lt;/i>
        &lt;/a>
    &lt;/td>
    &lt;td>250/178&lt;/td>
&lt;/TableComponent>`
    },
    Stripedrows = {
        script: `&lt;TableComponent :headers="['ID', 'Date', 'Customer', 'Action']" :rows="tableData.stripedRows" tableClass="table text-nowrap table-striped" v-slot:cell="{ row }">
    &lt;td>{{ row.id }}&lt;/td>
    &lt;td>{{ row.date }}&lt;/td>
    &lt;td>{{ row.name }}&lt;/td>
    &lt;td>
        &lt;button class="btn btn-sm btn-success btn-wave">
            ,&lt;i class="ri-download-2-line align-middle me-2 d-inline-block">&lt;/i>Download
        &lt;/button>
    &lt;/td>
&lt;/TableComponent>`
    },
    Stripedcolumns = {
        script: `&lt;TableComponent :headers="['ID', 'Date', 'Customer', 'Action']" :rows="tableData.stripedRows" tableClass="table text-nowrap table-striped-columns" v-slot:cell="{ row }">
    &lt;td>{{ row.id }}&lt;/td>
    &lt;td>{{ row.date }}&lt;/td>
    &lt;td>{{ row.name }}&lt;/td>
    &lt;td>
        &lt;button class="btn btn-sm btn-danger btn-wave">
            &lt;i class="ri-delete-bin-line align-middle me-2 d-inline-block">&lt;/i>Delete
        &lt;/button>
    &lt;/td>
&lt;/TableComponent>`
    },
    PrimaryTable = {
        script: ` &lt;TableComponent :headers="['#', 'First', 'Last', 'Handle']" :rows="tableData.colorTable" tableClass="table text-nowrap table-primary" v-slot:cell="{ row }">
    &lt;td>{{ row.id }}&lt;/td>
    &lt;td>{{ row.firstName }}&lt;/td>
    &lt;td>{{ row.lastName }}&lt;/td>
    &lt;td>{{ row.username }}&lt;/td>
&lt;/TableComponent>`
    },
    SecondaryTable = {
        script: `&lt;TableComponent :headers="['#', 'First', 'Last', 'Handle']" :rows="tableData.colorTable" tableClass="table text-nowrap table-secondary" v-slot:cell="{ row }">
    &lt;td>{{ row.id }}&lt;/td>
    &lt;td>{{ row.firstName }}&lt;/td>
    &lt;td>{{ row.lastName }}&lt;/td>
    &lt;td>{{ row.username }}&lt;/td>
&lt;/TableComponent>`
    },
    WarningTable = {
        script: `&lt;TableComponent :headers="['#', 'First', 'Last', 'Handle']" :rows="tableData.colorTable" tableClass="table text-nowrap table-warning" v-slot:cell="{ row }">
    &lt;td>{{ row.id }}&lt;/td>
    &lt;td>{{ row.firstName }}&lt;/td>
    &lt;td>{{ row.lastName }}&lt;/td>
    &lt;td>{{ row.username }}&lt;/td>
&lt;/TableComponent>`
    },
    DangerTable = {
        script: `  &lt;TableComponent :headers="['#', 'First', 'Last', 'Handle']" :rows="tableData.colorTable" tableClass="table text-nowrap table-danger" v-slot:cell="{ row }">
    &lt;td>{{ row.id }}&lt;/td>
    &lt;td>{{ row.firstName }}&lt;/td>
    &lt;td>{{ row.lastName }}&lt;/td>
    &lt;td>{{ row.username }}&lt;/td>
&lt;/TableComponent>`
    },
    DarkTable = {
        script: `,&lt;TableComponent :headers="['#', 'First', 'Last', 'Handle']" :rows="tableData.colorTable" tableClass="table text-nowrap table-dark" v-slot:cell="{ row }">
    &lt;td>{{ row.id }}&lt;/td>
    &lt;td>{{ row.firstName }}&lt;/td>
    &lt;td>{{ row.lastName }}&lt;/td>
    &lt;td>{{ row.username }}&lt;/td>
&lt;/TableComponent>`
    },
    SuccessTableWithStripedRows = {
        script: `
        &lt;TableComponent :headers="['#', 'First', 'Last', 'Handle']" :rows="tableData.colorTable" tableClass="table text-nowrap table-success table-striped" v-slot:cell="{ row }">
    &lt;td>{{ row.id }}&lt;/td>
    &lt;td>{{ row.firstName }}&lt;/td>
    &lt;td>{{ row.lastName }}&lt;/td>
    &lt;td>{{ row.username }}&lt;/td>
&lt;/TableComponent>`
    },
    HoverableRows = {
        script: ` &lt;TableComponent :headers="['Product Manager', 'Category', 'Team', 'Status']" :rows="tableData.hoverableRows" tableClass="table text-nowrap table-hover" v-slot:cell="{ row }">
    &lt;td>
        &lt;div class="d-flex align-items-center">
            &lt;div class="avatar avatar-sm me-2 avatar-rounded">
                &lt;img :src="(row.src)" alt="img">
            &lt;/div>
            &lt;div>
                &lt;div class="lh-1">
                    &lt;span>{{ row.name }}&lt;/span>
                &lt;/div>
                &lt;div class="lh-1">
                    &lt;span
                        class="fs-11 text-muted">{{ row.email }}&lt;/span>
                &lt;/div>
            &lt;/div>
        &lt;/div>
    &lt;/td>
    &lt;td>&lt;span :class="badge &#36;{row.color}">{{ row.category }}&lt;/span>&lt;/td>
    &lt;td>
        &lt;div class="avatar-list-stacked" >
            &lt;span v-for="(avatar, index) in row.avatars.slice(0, 3)" :key="index" class="avatar avatar-sm avatar-rounded">
                &lt;img :src="avatar" alt="img">
            &lt;/span>
            &lt;a class="avatar avatar-sm bg-primary text-fixed-white avatar-rounded"
                href="javascript:void(0);">
                +{{ row.extraAvatarsCount }}
            &lt;/a>
        &lt;/div>
    &lt;/td>
    &lt;td>
        &lt;div class="progress progress-xs">
            &lt;div class="progress-bar bg-primary" role="progressbar"
                :style="width: &#36;{row.progress}%" :aria-valuenow="&#36;{row.progress}" aria-valuemin="0"
                aria-valuemax="100">
            &lt;/div>
        &lt;/div>
    &lt;/td>
&lt;/TableComponent>`
    },
    HoverablerowsWithstripedrows = {
        script: `&lt;TableComponent :headers="['Invoice', 'Customer', 'Status', 'Date']" :rows="tableData.hoverableRow" tableClass="table text-nowrap table-striped table-hover" v-slot:cell="{ row }">
    &lt;td>{{ row.number }}&lt;/td>
    &lt;td>
        &lt;div class="d-flex align-items-center">
            &lt;div class="avatar avatar-sm me-2 avatar-rounded">
                &lt;img :src="(row.avatar)" alt="img">
            &lt;/div>
            &lt;div>
                &lt;div class="lh-1">
                    &lt;span>{{ row.name }}&lt;/span>
                &lt;/div>
                &lt;div class="lh-1">
                    &lt;span
                        class="fs-11 text-muted">{{ row.email }}&lt;/span>
                &lt;/div>
            &lt;/div>
        &lt;/div>
    &lt;/td>
    &lt;td>&lt;span :class="badge &#36;{row.statusClass}">
        &lt;i :class="&#36;{row.statusIcon} align-middle me-1">&lt;/i>{{ row.status }}&lt;/span>
    &lt;/td>
    &lt;td>Jul 26,2022&lt;/td>
&lt;/TableComponent>`
    },
    TableHeadPrimary = {
        script: `&lt;TableComponent :headers="['User Name', 'Transaction Id', 'Created', 'Status']" :rows="tableData.tableHeadwarning" tableClass="table text-nowrap" theadClass="table-primary" v-slot:cell="{ row }">
    &lt;td>{{ row.name }}&lt;/td>
    &lt;td>{{ row.orderNumber }}&lt;/td>
    &lt;td>{{ row.date }}&lt;/td>
    &lt;td>
        &lt;div class="hstack gap-2 fs-15">
            &lt;a href="javascript:void(0);" class="btn btn-icon btn-sm btn-success-transparent rounded-pill">&lt;i class="ri-download-2-line">&lt;/i>&lt;/a>
            &lt;a href="javascript:void(0);" class="btn btn-icon btn-sm btn-info-transparent rounded-pill">&lt;i class="ri-edit-line">&lt;/i>&lt;/a>
            &lt;a href="javascript:void(0);" class="btn btn-icon btn-sm btn-danger-transparent rounded-pill">&lt;i class="ri-delete-bin-line">&lt;/i>&lt;/a>
        &lt;/div>
    &lt;/td>
&lt;/TableComponent>`
    },
    TableHeadwarning = {
        script: `&lt;TableComponent :headers="['User Name', 'Transaction Id', 'Created', 'Status']" :rows="tableData.tableHeadwarning" tableClass="table text-nowrap" theadClass="table-warning" v-slot:cell="{ row }">
    &lt;td>{{ row.name }}&lt;/td>
    &lt;td>{{ row.orderNumber }}&lt;/td>
    &lt;td>{{ row.date }}&lt;/td>
    &lt;td>&lt;button :class="btn btn-sm btn-&#36;{row.statusClass}">{{ row.status }}&lt;/button> &lt;/td>
&lt;/TableComponent>`
    },
    TableHeadSuccess = {
        script: `&lt;TableComponent :headers="['User Name', 'Transaction Id', 'Created', 'Status']" :rows="tableData.tableHeadwarning" tableClass="table text-nowrap" theadClass="table-success" v-slot:cell="{ row }">
    &lt;td>{{ row.name }}&lt;/td>
    &lt;td>{{ row.orderNumber }}&lt;/td>
    &lt;td>{{ row.date }}&lt;/td>
    &lt;td>&lt;button :class="btn btn-sm btn-&#36;{row.statusClass}">{{ row.status }}&lt;/button> &lt;/td>
&lt;/TableComponent>`
    },
    TableHeadInfo = {
        script: ` &lt;TableComponent :headers="['User Name', 'Transaction Id', 'Created', 'Status']" :rows="tableData.tableHeadwarning" tableClass="table text-nowrap" theadClass="table-info" v-slot:cell="{ row }">
    &lt;td>{{ row.name }}&lt;/td>
    &lt;td>{{ row.orderNumber }}&lt;/td>
    &lt;td>{{ row.date }}&lt;/td>
    &lt;td>&lt;button :class="btn btn-sm btn-&#36;{row.statusClass}">{{ row.status }}&lt;/button> &lt;/td>
&lt;/TableComponent>`
    },
    TableHeadSecondary = {
        script: `&lt;TableComponent :headers="['User Name', 'Transaction Id', 'Created', 'Status']" :rows="tableData.tableHeadwarning" tableClass="table text-nowrap" theadClass="table-secondary" v-slot:cell="{ row }">
    &lt;td>{{ row.name }}&lt;/td>
    &lt;td>{{ row.orderNumber }}&lt;/td>
    &lt;td>{{ row.date }}&lt;/td>
    &lt;td>&lt;button :class="btn btn-sm btn-&#36;{row.statusClass}">{{ row.status }}&lt;/button> &lt;/td>
&lt;/TableComponent>`
    },
    TableHeadDanger = {
        script: ` &lt;TableComponent :headers="['User Name', 'Transaction Id', 'Created', 'Status']" :rows="tableData.tableHeadwarning" tableClass="table text-nowrap" theadClass="table-danger" v-slot:cell="{ row }">
    &lt;td>{{ row.name }}&lt;/td>
    &lt;td>{{ row.orderNumber }}&lt;/td>
    &lt;td>{{ row.date }}&lt;/td>
    &lt;td>&lt;button :class="btn btn-sm btn-&#36;{row.statusClass}">{{ row.status }}&lt;/button> &lt;/td>
&lt;/TableComponent>`
    },
    TableFoot = {
        script: `&lt;TableComponent :headers="['S.No', 'Team', 'Matches Won', 'Win Ratio']" :rows="tableData.tableFoot" tableClass="table text-nowrap" v-slot:cell="{ row }">
    &lt;td> {{ row.id }} &lt;/td>
    &lt;td> {{ row.location }}&lt;/td>
    &lt;td>  {{row.count}}&lt;/td>
    &lt;td> &lt;span class="badge bg-primary">{{ row.percentage }}&lt;/span>&lt;/td>
&lt;/TableComponent>`
    },
    TableWithCaption = {
        script: `&lt;TableComponent :headers="['S.No', 'Country', 'Medals Won', 'No Of Athletes']" :rows="tableData.tableWithCaption" tableClass="table text-nowrap" v-slot:cell="{ row }">
    &lt;td>{{ row.rank }}&lt;/td>
    &lt;td>{{ row.country }}&lt;/td>
    &lt;td>{{ row.year }}&lt;i class="ri-medal-line mx-2">&lt;/i>&lt;/td>
    &lt;td>{{ row.value }}&lt;/td>
    
&lt;/TableComponent>
&lt;caption class="d-flex">Top 3 Countries&lt;/caption>`
    },
    TableWithTopCaption = {
        script: `&lt;caption class="d-flex">Top IT Companies&lt;/caption>
&lt;TableComponent :headers="['S.No', 'Name', 'Revenue', 'Country']" :rows="tableData.tableWithTopCaption" tableClass="table text-nowrap caption-top" v-slot:cell="{ row }">
    &lt;td>{{ row.rank }}&lt;/td>
    &lt;td>{{ row.name }}&lt;/td>
    &lt;td>{{ row.revenue }}&lt;/td>
    &lt;td>{{ row.country }}&lt;/td>
&lt;/TableComponent>`
    },
    ActiveTables = {
        script: ` &lt;TableComponent :headers="['Name', 'Created On', 'Number', 'Status']" :rows="tableData.activeTables" tableClass="table text-nowrap" v-slot:cell="{ row }" >
    &lt;td>{{ row.name }}&lt;/td>
    &lt;td>{{ row.date }}&lt;/td>
    &lt;td>{{ row.phone }}&lt;/td>
    &lt;td>&lt;span :class="badge &#36;{row.statusClass}">{{ row.status }}&lt;/span>&lt;/td>
&lt;/TableComponent>`
    },
    SmallTables = {
        script: `&lt;TableComponent :headers="['Invoice', 'Created Date', 'Status', 'Action']" :rows="tableData.smallTables" tableClass="table text-nowrap table-sm" v-slot:cell="{ row }" >
    &lt;td>
        &lt;div class="form-check">
            &lt;input class="form-check-input" type="checkbox" value="" id="checkebox-sm" :checked="row.cheacked">
            &lt;label class="form-check-label" for="checkebox-sm"> {{ row.name }} &lt;/label>
        &lt;/div>
    &lt;/td>
    &lt;td>{{ row.date }}&lt;/td>
    &lt;td>&lt;span :class="badge &#36;{row.statusClass}">{{ row.status }}&lt;/span>&lt;/td>
    &lt;td>
        &lt;div class="hstack gap-2 fs-15">
            &lt;a href="javascript:void(0);" class="btn btn-icon btn-sm btn-light">&lt;i class="ri-download-2-line">&lt;/i>&lt;/a>
            &lt;a href="javascript:void(0);" class="btn btn-icon btn-sm btn-light">&lt;i class="ri-edit-line">&lt;/i>&lt;/a>
        &lt;/div>
    &lt;/td>
&lt;/TableComponent>`
    },
    Colorvariantstables = {
        script: `&lt;TableComponent :headers="['Color', 'Client', 'State', 'Quantity','Total Price']" :rows="tableData.colorvariantsTables" tableClass="table text-nowrap" v-slot:cell="{ row }" >
    &lt;td>{{ row.type }}&lt;/td>
    &lt;td>{{ row.title }}&lt;/td>
    &lt;td>&lt;span :class="badge &#36;{row.badgeClass}">{{ row.status }}&lt;/span>&lt;/td>
    &lt;td>{{ row.quantity }}&lt;/td>
    &lt;td>{{ row.amount }}&lt;/td>
&lt;/TableComponent>`
    },
    Nesting = {
        script: ` &lt;div class="table-responsive">
    &lt;table class="table text-nowrap table-striped table-bordered">
        &lt;thead>
            &lt;tr>
                &lt;th scope="col">#&lt;/th>
                &lt;th scope="col">First&lt;/th>
                &lt;th scope="col">Last&lt;/th>
                &lt;th scope="col">Handle&lt;/th>
            &lt;/tr>
        &lt;/thead>
        &lt;tbody>
            &lt;tr>
                &lt;th scope="row">1&lt;/th>
                &lt;td>Mark&lt;/td>
                &lt;td>Otto&lt;/td>
                &lt;td>@mdo&lt;/td>
            &lt;/tr>
            &lt;tr>
                &lt;td colspan="4">
                    &lt;table class="table text-nowrap mb-0">
                        &lt;thead>
                            &lt;tr>
                                &lt;th scope="col">Aplhabets&lt;/th>
                                &lt;th scope="col">Users&lt;/th>
                                &lt;th scope="col">Email&lt;/th>
                            &lt;/tr>
                        &lt;/thead>
                        &lt;tbody>
                            &lt;tr>
                                &lt;th scope="row">A&lt;/th>
                                &lt;td>Dino King&lt;/td>
                                &lt;td>dinoking231@gmail.com&lt;/td>
                            &lt;/tr>
                            &lt;tr>
                                &lt;th scope="row">B&lt;/th>
                                &lt;td>Poppins sams&lt;/td>
                                &lt;td>pops@gmail.com&lt;/td>
                            &lt;/tr>
                            &lt;tr>
                                &lt;th scope="row">C&lt;/th>
                                &lt;td>Brian Shaw&lt;/td>
                                &lt;td>swanbrian@gmail.com&lt;/td>
                            &lt;/tr>
                        &lt;/tbody>
                    &lt;/table>
                &lt;/td>
            &lt;/tr>
            &lt;tr>
                &lt;th scope="row">3&lt;/th>
                &lt;td>Larry&lt;/td>
                &lt;td>the Bird&lt;/td>
                &lt;td>@twitter&lt;/td>
            &lt;/tr>
            &lt;tr>
                &lt;th scope="row">4&lt;/th>
                &lt;td>Jimmy&lt;/td>
                &lt;td>the Ostrich&lt;/td>
                &lt;td>Dummy Text&lt;/td>
            &lt;/tr>
            &lt;tr>
                &lt;th scope="row">5&lt;/th>
                &lt;td>Cobra Kai&lt;/td>
                &lt;td>the Snake&lt;/td>
                &lt;td>Another Name&lt;/td>
            &lt;/tr>
        &lt;/tbody>
    &lt;/table>
&lt;/div>`
    },
    Alwaysresponsive = {
        script: `&lt;TableComponent :headers="tableHeader" :rows="tableData.alwaysResponsive" tableClass="table text-nowrap" v-slot:cell="{ row }" >
    &lt;td>&lt;input class="form-check-input" type="checkbox" id="checkboxNoLabel1" value="" aria-label="...">&lt;/td>
    &lt;td>
        &lt;div class="d-flex align-items-center">
            &lt;span class="avatar avatar-xs me-2 online avatar-rounded">
                &lt;img :src="(row.avatar)" alt="img">
            &lt;/span>{{ row.name }}
        &lt;/div>
    &lt;/td>
    &lt;td>{{ row.position }}&lt;/td>
    &lt;td>&lt;span :class="badge &#36;{row.badgeClass}">{{ row.badgeText }}&lt;/span>&lt;/td>
    &lt;td>{{ row.email }}&lt;/td>
    &lt;td>
        &lt;div class="avatar-list-stacked">
            &lt;span v-for="(collaborator, idx) in row.collaborators" :key="idx" class="avatar avatar-sm avatar-rounded">
              &lt;img :src="collaborator" alt="img">
            &lt;/span>
            &lt;a v-if="row.collaborators.length > 3" class="avatar avatar-sm bg-primary text-fixed-white avatar-rounded" href="javascript:void(0);">
              +{{ row.collaborators.length - 3 }}
            &lt;/a>
        &lt;/div>
    &lt;/td>
    &lt;td>
        &lt;div class="progress progress-xs">
            &lt;div class="progress-bar bg-primary" role="progressbar" :style="{ width: row.progress }" aria-valuenow="row.progressValue" aria-valuemin="0" aria-valuemax="100">&lt;/div>
        &lt;/div>
    &lt;/td>
    &lt;td>{{ row.salary }}&lt;/td>
    &lt;td>
        &lt;div class="hstack gap-2 fs-15">
            &lt;a href="javascript:void(0);" class="btn btn-icon btn-sm btn-success">&lt;i class="ri-download-2-line">&lt;/i>&lt;/a>
            &lt;a href="javascript:void(0);" class="btn btn-icon btn-sm btn-info">&lt;i class="ri-edit-line">&lt;/i>&lt;/a>
        &lt;/div>
    &lt;/td>
&lt;/TableComponent>`
    },
    Verticalalignment = {
        script: `&lt;div class="table-responsive">
    &lt;table class="table align-middle">
        &lt;thead>
            &lt;tr>
                &lt;th scope="col" class="w-25">Heading 1&lt;/th>
                &lt;th scope="col" class="w-25">Heading 2&lt;/th>
                &lt;th scope="col" class="w-25">Heading 3&lt;/th>
                &lt;th scope="col" class="w-25">Heading 4&lt;/th>
            &lt;/tr>
        &lt;/thead>
        &lt;tbody>
            &lt;tr>
                &lt;td>This cell inherits &lt;code>vertical-align: middle;&lt;/code> from
                    the
                    table&lt;/td>
                &lt;td>This cell inherits &lt;code>vertical-align: middle;&lt;/code> from
                    the
                    table&lt;/td>
                &lt;td>This cell inherits &lt;code>vertical-align: middle;&lt;/code> from
                    the
                    table&lt;/td>
                &lt;td>This here is some placeholder text, intended to take up
                    quite a
                    bit of vertical space, to demonstrate how the vertical
                    alignment
                    works in the preceding cells.&lt;/td>
            &lt;/tr>
            &lt;tr class="align-bottom">
                &lt;td>This cell inherits &lt;code>vertical-align: bottom;&lt;/code> from
                    the
                    table row&lt;/td>
                &lt;td>This cell inherits &lt;code>vertical-align: bottom;&lt;/code> from
                    the
                    table row&lt;/td>
                &lt;td>This cell inherits &lt;code>vertical-align: bottom;&lt;/code> from
                    the
                    table row&lt;/td>
                &lt;td>This here is some placeholder text, intended to take up
                    quite a
                    bit of vertical space, to demonstrate how the vertical
                    alignment
                    works in the preceding cells.&lt;/td>
            &lt;/tr>
            &lt;tr>
                &lt;td>This cell inherits &lt;code>vertical-align: middle;&lt;/code> from
                    the
                    table&lt;/td>
                &lt;td>This cell inherits &lt;code>vertical-align: middle;&lt;/code> from
                    the
                    table&lt;/td>
                &lt;td class="align-top">This cell is aligned to the top.&lt;/td>
                &lt;td>This here is some placeholder text, intended to take up
                    quite a
                    bit of vertical space, to demonstrate how the vertical
                    alignment
                    works in the preceding cells.&lt;/td>
            &lt;/tr>
        &lt;/tbody>
    &lt;/table>
&lt;/div>`
    }