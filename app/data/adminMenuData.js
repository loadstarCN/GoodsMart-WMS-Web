export let adminMenuData = [
    {
        headTitle: 'admin.nav.overview'
    },
    {
        path: '/admin/',
        type: 'link',
        title: 'admin.nav.dashboard',
        icon: 'ri-dashboard-line',
        selected: false,
        active: false,
        dirchange: false,
    },
    {
        headTitle: 'admin.nav.tenant-management'
    },
    {
        path: '/admin/tenants/',
        type: 'link',
        title: 'admin.nav.tenants',
        icon: 'ri-building-line',
        selected: false,
        active: false,
        dirchange: false,
    },
    {
        headTitle: 'admin.nav.system-management'
    },
    {
        path: '/admin/users/',
        type: 'link',
        title: 'admin.nav.users',
        icon: 'ri-user-settings-line',
        selected: false,
        active: false,
        dirchange: false,
    },
    {
        path: '/admin/roles/',
        type: 'link',
        title: 'admin.nav.roles',
        icon: 'ri-shield-user-line',
        selected: false,
        active: false,
        dirchange: false,
    },
    {
        path: '/admin/permissions/',
        type: 'link',
        title: 'admin.nav.permissions',
        icon: 'ri-lock-line',
        selected: false,
        active: false,
        dirchange: false,
    },
    {
        path: '/admin/logs/',
        type: 'link',
        title: 'admin.nav.logs',
        icon: 'ri-file-list-3-line',
        selected: false,
        active: false,
        dirchange: false,
    },
];
