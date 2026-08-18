import { useState, useEffect, useCallback, Component } from 'react';
const t = {
  en: {
    dashboard: 'Dashboard', users: 'Users', papers: 'Documents', audit: 'Audit Logs',
    infra: 'Infrastructure', notifications: 'Notifications', settings: 'Settings',
    adminPanel: 'Admin Panel', profile: 'Profile', signOut: 'Sign Out',
    totalUsers: 'Total Users', activeProjects: 'Active Projects', activeDocuments: 'Active Documents',
    students: 'Students', instructors: 'Instructors', admins: 'Admins',
    sourceFiles: 'source files', paperDocs: 'paper docs', categories: 'categories',
    collections: 'collections', userAccounts: 'User Accounts', createUser: 'Create User',
    email: 'Email', fullName: 'Full Name', role: 'Role', status: 'Status', actions: 'Actions',
    active: 'Active', banned: 'Banned', ban: 'Ban', activate: 'Activate',
    resetPassword: 'Reset Password', delete: 'Delete', saving: 'Saving...',
    resetSent: 'Reset email sent', resetFailed: 'Reset failed',
    noUsers: 'No users found', noLogs: 'No audit logs found',
    auditLogs: 'Audit Logs', timestamp: 'Timestamp', actor: 'Actor',
    action: 'Action', entity: 'Entity', details: 'Details',
    papersOverview: 'Documents Overview', drafts: 'Drafts', submitted: 'Submitted',
    inReview: 'In Review', published: 'Published', rejected: 'Rejected',
    systemHealth: 'System Health', storage: 'Storage', uptime: 'Uptime',
    services: 'Services', online: 'Online', offline: 'Offline',
    broadcast: 'Broadcast Notification', message: 'Message', send: 'Send',
    targetRole: 'Target Role', all: 'All', sent: 'Sent',
    settings: 'System Settings', appName: 'Application Name', save: 'Save',
    saved: 'Saved', maintenance: 'Maintenance Mode',
    total: 'total', prev: 'Prev', next: 'Next', page: 'Page',
    loadFailed: 'Failed to load data', retry: 'Retry',
    langSwitch: 'Tiếng Việt', copyright: 'Evidence Pilot © 2026. All rights reserved.',
    tourGuide: 'Guide', guide: 'Tour Guide', processGuide: 'Process Guide',
    createNew: 'Create New', filter: 'Filter', close: 'Close',
    firstName: 'First Name', lastName: 'Last Name', cancel: 'Cancel',
    password: 'Password',     confirmDelete: 'Delete this user?',
    userDeleted: 'User deleted',
    undoHeader: 'Item permanently deleted',
    undoHeaderUser: 'User account permanently deleted',
    undoCaution: 'Caution: This action will become permanent once the countdown expires.',
    undoBodyTemplate: 'The item {entityName}{entityDetails} was deleted{actorPart} at {timestamp}.',
    undoBodyTemplateUser: 'The account for user {entityName}{entityDetails} was deleted{actorPart} at {timestamp}.',
    undoLabel: 'Undo',
    undoRemaining: '({seconds}s remaining)',
    dismissLabel: 'Dismiss',
    done: 'Done',
    pipeline: 'Pipeline', documentCount: 'Document Count',
    admin: 'Admin', searchPlaceholder: 'Search data, logs, or infrastructure...',
    refreshLogs: 'Refresh Logs', refreshMetrics: 'Refresh Metrics', refreshQueue: 'Refresh Queue',
    refreshing: 'Refreshing...', adminUser: 'Admin User', systemManager: 'System Manager',
    loading: 'Loading',
    collectionsLibrary: 'Collections Library', failedDocuments: 'Failed Documents',
    noDocuments: 'No documents found', searchDocuments: 'Search documents...',
    searchLogs: 'Search logs by actor, entity or details...',
    userAll: 'User: All', actionAll: 'Action: All', actionUpdated: 'Action: Updated',
    actionCreated: 'Action: Created', actionBanned: 'Action: Banned',
    title: 'Title', project: 'Project', author: 'Author', recentDocuments: 'Recent Documents',
    noPipelineData: 'No document pipeline data available',
    footerTagline: 'EvidencePilot Admin v2.4.1. Crafted for academic excellence and data integrity.',
    usersSub: 'Manage institutional access and user permissions across the Evidence Pilot ecosystem.',
    projectsSub: 'Central terminal for managing all active and archived academic research initiatives.',
    papersSub: 'Manage and monitor research paper progress across all active projects.',
    auditSub: 'Review system activities and security events across the platform.',
    healthSub: 'Real-time infrastructure monitoring and resource allocation.',
    queueSub: 'Monitor and manage the document data extraction pipeline.',
    broadcastSub: "Send system-wide announcements or targeted messages to your research groups. Messages will appear in the user's notification center and as in-app banners.",
    collectionsSub: 'Manage and organize research data clusters across your organization.',
    settingsSub: 'Configure application parameters, categories, and review deployment variables.',
    papersBannerTitle: 'Current Active Documents',
    papersBannerText: 'Total volume across current session:',
    activeDocsLabel: 'active documents',
    chooseUserAccounts: '-- Choose User Accounts --',
    showingLogs: 'Showing {shown} of {total} logs',
    guideDashDesc: 'Overview of system KPIs at a glance.',
    guideDashUsers: 'Total registered users broken down by role.',
    guideDashProjects: 'Active projects with categories and collections.',
    guideDashDocuments: 'Total active documents including source files and paper docs.',
    guideDashStatus: 'User status breakdown: active vs banned accounts.',
    guideDashInfra: 'Infrastructure service readiness indicators.',
    guideDashDone: 'Dashboard overview complete.',
    guideUsersDesc: 'User management: create, ban, reset password, or delete accounts.',
    guideUsersCreate: 'Create one Student or Instructor. The temporary password comes from the email.',
    guideUsersImport: 'Upload one JSON file containing up to 200 users of one role.',
    guideUsersTable: 'Lists users with email, name, student code, immutable role, status, and actions.',
    guideUsersActions: 'Ban/activate, reset password, or delete a user.',
    guideUsersDone: 'Users walkthrough complete.',
    guidePapersDesc: 'Paper pipeline overview. Each card represents a stage.',
    guidePapersFlow: 'Drafts → Submitted → In Review → Published → Rejected. Shows paper flow through the system.',
    guidePapersCount: 'Total paper documents and source files in the system.',
    guidePapersDone: 'Papers overview complete.',
    guideAuditDesc: 'Audit trail of all system activities.',
    guideAuditFilter: 'Filter logs by entity type, such as USER, PROJECT, and DOCUMENT.',
    guideAuditTable: 'Each row shows when, who, what action, which entity, and changed values.',
    guideAuditDone: 'Audit logs walkthrough complete.',
    guideInfraDesc: 'Infrastructure health monitoring.',
    guideInfraServices: 'Each service shows online/offline status. Red indicates attention needed.',
    guideInfraStorage: 'Storage usage bar. Monitor capacity to avoid service disruption.',
    guideInfraDone: 'Infrastructure overview complete.',
    guideNotifDesc: 'Broadcast notifications to users.',
    guideNotifForm: 'Type your message, select target role, and send. All users receive it in real-time.',
    guideNotifHistory: 'Previously sent notifications appear here with timestamp and target role.',
    guideNotifDone: 'Notifications walkthrough complete.',
    guideSettingsDesc: 'System settings management.',
    guideSettingsForm: 'Configure application name and other system preferences.',
    guideSettingsDone: 'Settings walkthrough complete.',
    collapse: 'Collapse',
    projects: 'Projects', projectTitle: 'Title', projectStatus: 'Status',
    createdAt: 'Created', noProjects: 'No projects found', projectDeleted: 'Project deleted',
    guideProjectsDesc: 'View and manage all projects in the system.',
    guideProjectsTable: 'Each row shows project title, status, and creation date. Admins can delete projects.',
    guideProjectsDone: 'Projects walkthrough complete.',
    collectionCategories: 'Collection Categories', categoryName: 'Name', categoryDescription: 'Description',
    sourceCategories: 'Source Categories', categoryCode: 'Code',
    addCategory: 'Add Category', editCategory: 'Edit Category',
    noCategories: 'No categories', categorySaved: 'Category saved', categoryDeleted: 'Category deleted',
    guideCategoriesDesc: 'Manage collection categories used to organize evidence collections.',
    guideCategoriesList: 'List of all categories. Each shows name, description, and active status.',
    guideCategoriesForm: 'Add or edit a category. Name is required, description is optional.',
    guideCategoriesDone: 'Categories walkthrough complete.',
    systemConfig: 'System Configuration', configKey: 'Setting', configValue: 'Value',
    configNote: 'Read-only. Configured via environment variables.',
    guideConfigDesc: 'View current system configuration values.',
    guideConfigTable: 'Each row shows a setting name and its current value. Loaded at startup.',
    guideConfigDone: 'Configuration walkthrough complete.',
    extractionQueue: 'Extraction Queue', extractionStatus: 'Status', queueSummary: 'Queue Summary',
    noFailedDocuments: 'No failed documents', queueRetry: 'Retry',
    guideQueueDesc: 'Monitor document extraction progress and retry failed jobs.',
    guideQueueCards: 'Summary cards show counts per processing status.',
    guideQueueFailed: 'List of failed documents. Click Retry to re-queue.',
    guideQueueDone: 'Extraction queue walkthrough complete.',
    broadcastHistory: 'Broadcast History', recipients: 'Recipients', noBroadcastHistory: 'No broadcast history',
    guideHistoryDesc: 'View past broadcast notifications sent to users.',
    guideHistoryTable: 'Each entry shows message, target role, recipient count, and sent time.',
    guideHistoryDone: 'Broadcast history walkthrough complete.',
    collections: 'Collections', instructor: 'Instructor', sourceCount: 'Sources',
    noCollections: 'No collections found',
    guideCollectionsDesc: 'Browse all instructor evidence collections.',
    guideCollectionsTable: 'List of collections with instructor email and source count.',
    guideCollectionsDone: 'Collections walkthrough complete.',
    // UsersTab
    searchUsers: 'Search by email, name, or student code...', allRoles: 'All Roles', allStatuses: 'All Statuses',
    emailAddress: 'Email Address', userRole: 'User Role',
    studentCode: 'Student Code', importUsers: 'Import JSON', jsonFile: 'JSON file',
    importUsersHint: 'Use { role, users } with one STUDENT or INSTRUCTOR role and no more than 200 users. Any invalid item cancels the entire import.',
    temporaryPasswordHint: 'The temporary password is the lowercase part before @ in the email. The user will be prompted to change it after the first login.',
    importing: 'Importing...', importSuccess: 'Import complete: {created} created, {updated} updated.',
    importFailed: 'Nothing was imported. Fix these errors and try again:', item: 'Item',
    jsonFileRequired: 'Select a .json file.',
    banUser: 'Ban User', activateUser: 'Activate User', deleteUser: 'Delete User',
    showingUsers: 'Showing {shown} of {total} users',
    // ProjectsTab
    unarchiveSuccess: 'Project workspace unarchived and restored to active state!',
    unarchiveFailed: 'Failed to unarchive project.',
    confirmDeleteProject: 'Are you sure you want to delete this project?',
    projectDeletedSuccess: 'Project deleted successfully!',
    memberAdded: 'Member added successfully!',
    confirmRemoveMember: 'Are you sure you want to remove this member?',
    memberRemoved: 'Member removed successfully!',
    memberRoleUpdated: 'Member role updated successfully!',
    memberLoadFailed: 'Failed to load members or users list.',
    selectUserFirst: 'Please select a user to add.',
    memberAddFailed: 'Failed to add member. Double check if they are already in the project.',
    memberRemoveFailed: 'Failed to remove member.',
    memberRoleUpdateFailed: 'Failed to update member role.',
    // CollectionsTab
    confirmDeleteCollection: 'Are you sure you want to delete this collection?',
    collectionDeleted: 'Collection deleted successfully!',
    collectionDeleteFailed: 'Failed to delete collection.',
    unnamedCollection: 'Unnamed Collection',
    // ExtractionQueueTab
    reQueueSuccess: 'Document extraction job re-queued successfully!',
    reQueueFailed: 'Failed to re-queue document.',
    errorDetails: 'Error details',
    showingDocs: 'Showing {shown} of {total} documents',
    // NotificationsTab
    notifMsgRequired: 'Please enter a notification message.',
    broadcastSent: 'Broadcast sent successfully!',
    broadcastFailed: 'Failed to send broadcast.',
    draftSaved: 'Draft saved successfully!',
    typeMsgFirst: 'Please type a message first.',
    messageComposer: 'Message Composer', notifBody: 'Notification Body',
    recipientSegment: 'Recipient Segment', urgencyLevel: 'Urgency Level',
    allUsers: 'All Users', studentsOpt: 'Students', instructorsOpt: 'Instructors',
    standard: 'Standard', urgent: 'Urgent',
    saveDraft: 'Save Draft', sendBroadcast: 'Send Broadcast', sending: 'Sending...',
    announceDraftPlaceholder: 'Draft your system announcement here...',
    delivered: 'Delivered',
    sentAnnouncementTo: 'Sent announcement to {count} active {role} accounts.',
    sentTo: 'Sent to {role}.',
    // SettingsTab
    settingsSaved: 'System settings saved successfully!',
    categoryUpdated: 'Category updated successfully!',
    categoryCreated: 'Category created successfully!',
    categorySaveFailed: 'Failed to save category.',
    categoryDeletedOk: 'Category deleted successfully!',
    categoryDeleteFailed: 'Failed to delete category.',
    envExported: 'Environment file exported successfully!',
    confirmDeleteCategory: 'Are you sure you want to delete this category?',
    secretLabel: 'SECRET', internalLabel: 'INTERNAL', publicLabel: 'PUBLIC',
  },
  vi: {
    dashboard: 'Bảng điều khiển', users: 'Người dùng', papers: 'Tài liệu', audit: 'Nhật ký',
    infra: 'Hạ tầng', notifications: 'Thông báo', settings: 'Cài đặt',
    adminPanel: 'Quản trị hệ thống', profile: 'Hồ sơ', signOut: 'Đăng xuất',
    totalUsers: 'Tổng người dùng', activeProjects: 'Dự án đang hoạt động', activeDocuments: 'Tài liệu đang hoạt động',
    students: 'Sinh viên', instructors: 'Giảng viên', admins: 'Quản trị viên',
    sourceFiles: 'tệp nguồn', paperDocs: 'bài báo', categories: 'danh mục',
    collections: 'bộ sưu tập', userAccounts: 'Tài khoản người dùng', createUser: 'Tạo người dùng',
    email: 'Email', fullName: 'Họ tên', role: 'Vai trò', status: 'Trạng thái', actions: 'Thao tác',
    active: 'Hoạt động', banned: 'Bị khóa', ban: 'Khóa', activate: 'Kích hoạt',
    resetPassword: 'Đặt lại mật khẩu', delete: 'Xóa', saving: 'Đang lưu...',
    resetSent: 'Đã gửi email đặt lại', resetFailed: 'Đặt lại thất bại',
    noUsers: 'Không tìm thấy người dùng', noLogs: 'Không có nhật ký',
    auditLogs: 'Nhật ký hệ thống', timestamp: 'Thời gian', actor: 'Người thực hiện',
    action: 'Hành động', entity: 'Đối tượng', details: 'Chi tiết',
    papersOverview: 'Tổng quan tài liệu', drafts: 'Bản nháp', submitted: 'Đã gửi',
    inReview: 'Đang đánh giá', published: 'Đã xuất bản', rejected: 'Từ chối',
    systemHealth: 'Sức khỏe hệ thống', storage: 'Lưu trữ', uptime: 'Thời gian hoạt động',
    services: 'Dịch vụ', online: 'Trực tuyến', offline: 'Ngoại tuyến',
    broadcast: 'Gửi thông báo', message: 'Nội dung', send: 'Gửi',
    targetRole: 'Đối tượng', all: 'Tất cả', sent: 'Đã gửi',
    settings: 'Cài đặt hệ thống', appName: 'Tên ứng dụng', save: 'Lưu',
    saved: 'Đã lưu', maintenance: 'Chế độ bảo trì',
    total: 'tổng', prev: 'Trước', next: 'Sau', page: 'Trang',
    loadFailed: 'Tải dữ liệu thất bại', retry: 'Thử lại',
    langSwitch: 'English', copyright: 'Evidence Pilot © 2026. Bảo lưu mọi quyền.',
    tourGuide: 'Hướng dẫn', guide: 'Hướng dẫn sử dụng', processGuide: 'Quy trình',
    createNew: 'Tạo mới', filter: 'Lọc', close: 'Đóng',
    firstName: 'Tên', lastName: 'Họ', cancel: 'Hủy',
    password: 'Mật khẩu',     confirmDelete: 'Xóa người dùng này?',
    userDeleted: 'Đã xóa người dùng',
    undoHeader: 'Mục đã bị xóa vĩnh viễn',
    undoHeaderUser: 'Tài khoản người dùng đã bị xóa vĩnh viễn',
    undoCaution: 'Cảnh báo: Hành động này sẽ trở nên vĩnh viễn khi hết thời gian đếm ngược.',
    undoBodyTemplate: 'Mục {entityName}{entityDetails} đã bị xóa{actorPart} lúc {timestamp}.',
    undoBodyTemplateUser: 'Tài khoản của người dùng {entityName}{entityDetails} đã bị xóa{actorPart} lúc {timestamp}.',
    undoLabel: 'Hoàn tác',
    undoRemaining: '(còn {seconds} giây)',
    dismissLabel: 'Bỏ qua',
    done: 'Hoàn tất',
    pipeline: 'Quy trình', documentCount: 'Số lượng tài liệu',
    admin: 'Quản trị', searchPlaceholder: 'Tìm kiếm dữ liệu, nhật ký hoặc hạ tầng...',
    refreshLogs: 'Làm mới nhật ký', refreshMetrics: 'Làm mới chỉ số', refreshQueue: 'Làm mới hàng đợi',
    refreshing: 'Đang làm mới...', adminUser: 'Quản trị viên', systemManager: 'Quản lý hệ thống',
    loading: 'Đang tải',
    collectionsLibrary: 'Thư viện bộ sưu tập', failedDocuments: 'Tài liệu thất bại',
    noDocuments: 'Không tìm thấy tài liệu', searchDocuments: 'Tìm kiếm tài liệu...',
    searchLogs: 'Tìm kiếm nhật ký theo người thực hiện, đối tượng hoặc chi tiết...',
    userAll: 'Người dùng: Tất cả', actionAll: 'Hành động: Tất cả', actionUpdated: 'Hành động: Đã cập nhật',
    actionCreated: 'Hành động: Đã tạo', actionBanned: 'Hành động: Đã khóa',
    title: 'Tiêu đề', project: 'Dự án', author: 'Tác giả', recentDocuments: 'Tài liệu gần đây',
    noPipelineData: 'Không có dữ liệu quy trình tài liệu',
    footerTagline: 'EvidencePilot Admin v2.4.1. Phục vụ học thuật xuất sắc và tính toàn vẹn dữ liệu.',
    usersSub: 'Quản lý quyền truy cập và phân quyền người dùng trên toàn hệ thống Evidence Pilot.',
    projectsSub: 'Trung tâm quản lý tất cả các sáng kiến nghiên cứu học thuật đang hoạt động và đã lưu trữ.',
    papersSub: 'Quản lý và theo dõi tiến trình tài liệu nghiên cứu trong tất cả dự án đang hoạt động.',
    auditSub: 'Xem lại các hoạt động và sự kiện bảo mật trên toàn nền tảng.',
    healthSub: 'Giám sát hạ tầng và phân bổ tài nguyên theo thời gian thực.',
    queueSub: 'Theo dõi và quản lý quy trình trích xuất dữ liệu tài liệu.',
    broadcastSub: 'Gửi thông báo toàn hệ thống hoặc thông báo có mục tiêu đến các nhóm nghiên cứu. Thông báo sẽ xuất hiện trong trung tâm thông báo của người dùng và dưới dạng banner.',
    collectionsSub: 'Quản lý và sắp xếp các cụm dữ liệu nghiên cứu trong tổ chức của bạn.',
    settingsSub: 'Cấu hình tham số ứng dụng, danh mục và xem lại biến triển khai.',
    papersBannerTitle: 'Tài liệu đang hoạt động',
    papersBannerText: 'Tổng khối lượng trong phiên hiện tại:',
    activeDocsLabel: 'tài liệu đang hoạt động',
    guideDashDesc: 'Tổng quan các chỉ số KPI của hệ thống.',
    guideDashUsers: 'Tổng số người dùng đã đăng ký, phân loại theo vai trò.',
    guideDashProjects: 'Dự án đang hoạt động với danh mục và bộ sưu tập.',
    guideDashDocuments: 'Tổng số tài liệu đang hoạt động bao gồm tệp nguồn và bài báo.',
    guideDashStatus: 'Phân loại trạng thái người dùng: hoạt động và bị khóa.',
    guideDashInfra: 'Chỉ số sẵn sàng của dịch vụ hạ tầng.',
    guideDashDone: 'Đã hoàn thành tổng quan bảng điều khiển.',
    guideUsersDesc: 'Quản lý người dùng: tạo, khóa, đặt lại mật khẩu hoặc xóa tài khoản.',
    guideUsersCreate: 'Tạo một Sinh viên hoặc Giảng viên. Mật khẩu tạm được lấy từ email.',
    guideUsersImport: 'Tải lên một tệp JSON chứa tối đa 200 người dùng cùng vai trò.',
    guideUsersTable: 'Danh sách người dùng với email, tên, mã sinh viên, vai trò cố định, trạng thái và thao tác.',
    guideUsersActions: 'Khóa/kích hoạt, đặt lại mật khẩu hoặc xóa người dùng.',
    guideUsersDone: 'Đã hoàn thành hướng dẫn quản lý người dùng.',
    guidePapersDesc: 'Tổng quan quy trình bài báo. Mỗi thẻ đại diện cho một giai đoạn.',
    guidePapersFlow: 'Bản nháp → Đã gửi → Đang đánh giá → Đã xuất bản → Từ chối.',
    guidePapersCount: 'Tổng số bài báo và tệp nguồn trong hệ thống.',
    guidePapersDone: 'Đã hoàn thành tổng quan bài báo.',
    guideAuditDesc: 'Nhật ký kiểm tra tất cả hoạt động hệ thống.',
    guideAuditFilter: 'Lọc nhật ký theo loại đối tượng, như USER, PROJECT và DOCUMENT.',
    guideAuditTable: 'Mỗi dòng hiển thị thời gian, ai thực hiện, hành động gì, đối tượng nào và giá trị thay đổi.',
    guideAuditDone: 'Đã hoàn thành hướng dẫn nhật ký kiểm tra.',
    guideInfraDesc: 'Giám sát sức khỏe hạ tầng.',
    guideInfraServices: 'Mỗi dịch vụ hiển thị trạng thái trực tuyến/ngoại tuyến. Màu đỏ cần chú ý.',
    guideInfraStorage: 'Thanh sử dụng bộ nhớ. Theo dõi dung lượng để tránh gián đoạn dịch vụ.',
    guideInfraDone: 'Đã hoàn thành tổng quan hạ tầng.',
    guideNotifDesc: 'Gửi thông báo đến người dùng.',
    guideNotifForm: 'Nhập nội dung, chọn đối tượng và gửi. Người dùng nhận thông báo theo thời gian thực.',
    guideNotifHistory: 'Các thông báo đã gửi hiển thị tại đây với thời gian và đối tượng nhận.',
    guideNotifDone: 'Đã hoàn thành hướng dẫn thông báo.',
    guideSettingsDesc: 'Quản lý cài đặt hệ thống.',
    guideSettingsForm: 'Cấu hình tên ứng dụng và các tùy chọn hệ thống khác.',
    guideSettingsDone: 'Đã hoàn thành hướng dẫn cài đặt.',
    collapse: 'Đóng tab',
    projects: 'Dự án', projectTitle: 'Tiêu đề', projectStatus: 'Trạng thái',
    createdAt: 'Ngày tạo', noProjects: 'Không có dự án', projectDeleted: 'Đã xóa dự án',
    guideProjectsDesc: 'Xem và quản lý tất cả dự án trong hệ thống.',
    guideProjectsTable: 'Mỗi dòng hiển thị tiêu đề, trạng thái và ngày tạo. Quản trị viên có thể xóa dự án.',
    guideProjectsDone: 'Đã hoàn thành hướng dẫn dự án.',
    collectionCategories: 'Danh mục bộ sưu tập', categoryName: 'Tên', categoryDescription: 'Mô tả',
    sourceCategories: 'Thể loại nguồn', categoryCode: 'Mã',
    addCategory: 'Thêm danh mục', editCategory: 'Sửa danh mục',
    noCategories: 'Không có danh mục', categorySaved: 'Đã lưu danh mục', categoryDeleted: 'Đã xóa danh mục',
    guideCategoriesDesc: 'Quản lý danh mục bộ sưu tập dùng để phân loại bộ sưu tập bằng chứng.',
    guideCategoriesList: 'Danh sách tất cả danh mục. Mỗi danh mục hiển thị tên, mô tả và trạng thái.',
    guideCategoriesForm: 'Thêm hoặc sửa danh mục. Tên là bắt buộc, mô tả không bắt buộc.',
    guideCategoriesDone: 'Đã hoàn thành hướng dẫn danh mục.',
    systemConfig: 'Cấu hình hệ thống', configKey: 'Cài đặt', configValue: 'Giá trị',
    configNote: 'Chỉ đọc. Cấu hình qua biến môi trường.',
    guideConfigDesc: 'Xem các giá trị cấu hình hệ thống hiện tại.',
    guideConfigTable: 'Mỗi dòng hiển thị tên cài đặt và giá trị hiện tại. Được tải khi khởi động.',
    guideConfigDone: 'Đã hoàn thành hướng dẫn cấu hình.',
    extractionQueue: 'Hàng đợi trích xuất', extractionStatus: 'Trạng thái', queueSummary: 'Tóm tắt hàng đợi',
    noFailedDocuments: 'Không có tài liệu thất bại', queueRetry: 'Thử lại',
    guideQueueDesc: 'Theo dõi tiến trình trích xuất tài liệu và thử lại các tác vụ thất bại.',
    guideQueueCards: 'Thẻ tóm tắt hiển thị số lượng theo từng trạng thái xử lý.',
    guideQueueFailed: 'Danh sách tài liệu thất bại. Nhấp Thử lại để xếp hàng lại.',
    guideQueueDone: 'Đã hoàn thành hướng dẫn hàng đợi trích xuất.',
    broadcastHistory: 'Lịch sử thông báo', recipients: 'Người nhận', noBroadcastHistory: 'Không có lịch sử thông báo',
    guideHistoryDesc: 'Xem các thông báo đã gửi trước đây đến người dùng.',
    guideHistoryTable: 'Mỗi mục hiển thị nội dung, đối tượng nhận, số lượng người nhận và thời gian gửi.',
    guideHistoryDone: 'Đã hoàn thành hướng dẫn lịch sử thông báo.',
    collections: 'Bộ sưu tập', instructor: 'Giảng viên', sourceCount: 'Nguồn',
    noCollections: 'Không tìm thấy bộ sưu tập',
    guideCollectionsDesc: 'Xem tất cả bộ sưu tập bằng chứng của giảng viên.',
    guideCollectionsTable: 'Danh sách bộ sưu tập với email giảng viên và số lượng nguồn.',
    guideCollectionsDone: 'Đã hoàn thành hướng dẫn bộ sưu tập.',
    chooseUserAccounts: '-- Chọn tài khoản người dùng --',
    showingLogs: 'Hiển thị {shown} trong tổng số {total} bản ghi',
    // UsersTab
    searchUsers: 'Tìm theo email, tên hoặc mã sinh viên...', allRoles: 'Tất cả vai trò', allStatuses: 'Tất cả trạng thái',
    emailAddress: 'Địa chỉ Email', userRole: 'Vai trò người dùng',
    studentCode: 'Mã số sinh viên', importUsers: 'Import JSON', jsonFile: 'Tệp JSON',
    importUsersHint: 'Dùng cấu trúc { role, users } với một vai trò STUDENT hoặc INSTRUCTOR và tối đa 200 người dùng. Một phần tử sai sẽ hủy toàn bộ lần import.',
    temporaryPasswordHint: 'Mật khẩu tạm là phần trước @ trong email, viết thường. Người dùng sẽ được nhắc đổi mật khẩu sau lần đăng nhập đầu.',
    importing: 'Đang import...', importSuccess: 'Import hoàn tất: tạo {created}, cập nhật {updated}.',
    importFailed: 'Không có dữ liệu nào được import. Hãy sửa các lỗi sau:', item: 'Phần tử',
    jsonFileRequired: 'Hãy chọn tệp .json.',
    banUser: 'Khóa người dùng', activateUser: 'Kích hoạt người dùng', deleteUser: 'Xóa người dùng',
    showingUsers: 'Hiển thị {shown} trong tổng số {total} người dùng',
    // ProjectsTab
    unarchiveSuccess: 'Không gian làm việc đã được khôi phục về trạng thái hoạt động!',
    unarchiveFailed: 'Khôi phục dự án thất bại.',
    confirmDeleteProject: 'Bạn có chắc muốn xóa dự án này?',
    projectDeletedSuccess: 'Đã xóa dự án thành công!',
    memberAdded: 'Đã thêm thành viên thành công!',
    confirmRemoveMember: 'Bạn có chắc muốn xóa thành viên này?',
    memberRemoved: 'Đã xóa thành viên thành công!',
    memberRoleUpdated: 'Đã cập nhật vai trò thành viên!',
    memberLoadFailed: 'Không thể tải danh sách thành viên hoặc người dùng.',
    selectUserFirst: 'Vui lòng chọn người dùng để thêm.',
    memberAddFailed: 'Thêm thành viên thất bại. Kiểm tra xem họ đã trong dự án chưa.',
    memberRemoveFailed: 'Xóa thành viên thất bại.',
    memberRoleUpdateFailed: 'Cập nhật vai trò thành viên thất bại.',
    // CollectionsTab
    confirmDeleteCollection: 'Bạn có chắc muốn xóa bộ sưu tập này?',
    collectionDeleted: 'Đã xóa bộ sưu tập thành công!',
    collectionDeleteFailed: 'Xóa bộ sưu tập thất bại.',
    unnamedCollection: 'Bộ sưu tập không có tên',
    // ExtractionQueueTab
    reQueueSuccess: 'Đã xếp lại hàng đợi trích xuất tài liệu thành công!',
    reQueueFailed: 'Xếp lại hàng đợi thất bại.',
    errorDetails: 'Chi tiết lỗi',
    showingDocs: 'Hiển thị {shown} trong tổng số {total} tài liệu',
    // NotificationsTab
    notifMsgRequired: 'Vui lòng nhập nội dung thông báo.',
    broadcastSent: 'Đã gửi thông báo thành công!',
    broadcastFailed: 'Gửi thông báo thất bại.',
    draftSaved: 'Đã lưu bản nháp thành công!',
    typeMsgFirst: 'Vui lòng nhập nội dung trước.',
    messageComposer: 'Soạn thông báo', notifBody: 'Nội dung thông báo',
    recipientSegment: 'Đối tượng nhận', urgencyLevel: 'Mức độ khẩn cấp',
    allUsers: 'Tất cả người dùng', studentsOpt: 'Sinh viên', instructorsOpt: 'Giảng viên',
    standard: 'Tiêu chuẩn', urgent: 'Khẩn cấp',
    saveDraft: 'Lưu bản nháp', sendBroadcast: 'Gửi thông báo', sending: 'Đang gửi...',
    announceDraftPlaceholder: 'Soạn thông báo hệ thống tại đây...',
    delivered: 'Đã giao',
    sentAnnouncementTo: 'Đã gửi thông báo đến {count} tài khoản {role} đang hoạt động.',
    sentTo: 'Đã gửi đến {role}.',
    // SettingsTab
    settingsSaved: 'Đã lưu cài đặt hệ thống thành công!',
    categoryUpdated: 'Đã cập nhật danh mục thành công!',
    categoryCreated: 'Đã tạo danh mục thành công!',
    categorySaveFailed: 'Lưu danh mục thất bại.',
    categoryDeletedOk: 'Đã xóa danh mục thành công!',
    categoryDeleteFailed: 'Xóa danh mục thất bại.',
    envExported: 'Đã xuất file cấu hình môi trường thành công!',
    confirmDeleteCategory: 'Bạn có chắc muốn xóa danh mục này?',
    secretLabel: 'BÍ MẬT', internalLabel: 'NỘI BỘ', publicLabel: 'CÔNG KHAI',
  }
};

class SectionBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Admin section crashed:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 flex items-center justify-center bg-[#f8fafc] min-h-[50vh]">
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center max-w-md shadow-sm">
            <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 mx-auto mb-4">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <h3 className="font-bold text-slate-800 text-sm">This section hit an unexpected error</h3>
            <p className="text-xs text-gray-400 font-medium mt-1 mb-4">The rest of the admin console is unaffected. Reload the section to try again.</p>
            <button
              onClick={() => this.setState({ hasError: false })}
              className="px-4 py-2 bg-[#0c162e] hover:bg-[#152447] text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
            >
              Reload Section
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}


function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-4 p-6">
      <div className="h-6 bg-gray-200 rounded w-1/3" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="h-24 bg-gray-200 rounded-2xl" />
        <div className="h-24 bg-gray-200 rounded-2xl" />
        <div className="h-24 bg-gray-200 rounded-2xl" />
      </div>
      <div className="h-64 bg-gray-200 rounded-2xl" />
    </div>
  );
}


function ErrorBlock({ msg, onRetry }) {
  return (
    <div className="flex items-center justify-between p-4 mx-6 mt-4 bg-rose-50 border border-rose-200 rounded-xl">
      <span className="text-sm font-medium text-rose-700">{msg}</span>
      {onRetry && <button onClick={onRetry} className="text-sm font-bold text-rose-700 underline hover:no-underline">{t.retry}</button>}
    </div>
  );
}


function StatCard({ label, value, sub, icon, iconBg }) {
  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between min-h-[105px]">
      <div className="space-y-1">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">{label}</span>
        <div className="text-2xl font-black text-slate-800">{value}</div>
        {sub && <div className="text-[10px] text-gray-500 font-semibold flex items-center gap-1 mt-0.5">{sub}</div>}
      </div>
      {icon && (
        <div className={`w-9 h-9 rounded-full flex items-center justify-center ${iconBg || 'bg-blue-50 text-blue-600'} shrink-0`}>
          {icon}
        </div>
      )}
    </div>
  );
}

/* ----- SECTIONS ----- */


function JsonTree({ data }) {
  if (data === null || data === undefined) return <span className="text-gray-400">null</span>;
  if (typeof data !== 'object') {
    return <span className={typeof data === 'string' ? 'text-emerald-700' : 'text-blue-700'}>{JSON.stringify(data)}</span>;
  }
  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="text-gray-400">[]</span>;
    return (
      <div className="pl-3 border-l border-gray-100 space-y-0.5">
        {data.map((v, i) => (
          <div key={i}><span className="text-gray-400 text-[10px] font-bold">[{i}]</span>{' '}<JsonTree data={v} /></div>
        ))}
      </div>
    );
  }
  const entries = Object.entries(data);
  if (entries.length === 0) return <span className="text-gray-400">{'{}'}</span>;
  return (
    <div className="pl-3 border-l border-gray-100 space-y-0.5">
      {entries.map(([k, v]) => (
        <div key={k} className="break-words">
          <span className="text-rose-600 font-bold">{k}</span>
          <span className="text-gray-300">: </span>
          <JsonTree data={v} />
        </div>
      ))}
    </div>
  );
}


export { t, SectionBoundary, PageSkeleton, ErrorBlock, StatCard, JsonTree };
