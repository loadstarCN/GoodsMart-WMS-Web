// 商品分类选项（含工艺说明）
export const categoriesOptions = [
    "Pins & Badges",                 // 徽章/吧唧（含铁皮/亚克力/光栅工艺）
    "Action Figures & Models",       // 手办模型（含树脂/PVC手办、黏土人）
    "Acrylic Stands & Goods",        // 亚克力制品（立牌/挂件/流麻）
    "Plush Toys",                    // 毛绒玩偶（含发声/功能性设计）
    "Art Boards & Shikishi",         // 色纸/签名板（含复写/限量款）
    "Card Games & Collectibles",     // 卡牌收藏（含镭射票/透卡/拍立得）
    "Apparel & Bags",                // 服饰箱包（痛衣/COS服/痛包）
    "3C Accessories",                // 数码周边（角色定制键盘/耳机）
    "Themed Food & Beverages",       // 主题食品（联名零食/节日礼盒）
    "Others"                         // 其他（NFT实体化周边等）
]

// 货币类型选项
export const currenciesOptions = ['USD', 'JPY', 'CNY']

// 计量单位选项
export const unitsOptions = [
    'pcs', 'set', 'box', 'roll', 'kg', 'L', 'pair',
    'piece', 'sheet', 'pack', 'case', 'bottle', 'bag'
]

// 标签选项（分业务维度）
export const tagsOptions = [
    /* Storage Attributes */
    "Room Temperature",                 // 常温存储区（普通货物存储区域）
    "Refrigerated (2-8℃)",              // 冷藏区（药品/生鲜专用温控区）
    "Frozen (-18℃)",                    // 冷冻区（冷冻食品存储区）
    "Climate Controlled",               // 恒温恒湿仓（精密仪器存储环境）
    "High Rack Zone",                   // 高位货架区（10米以上立体货架区）
    "Floor Stacking Area",              // 地堆存储区（托盘直接地面堆放）
    "Cross-Border Warehouse",           // 跨境仓（保税区外跨境商品存储）
    "Bonded Warehouse",                 // 保税仓（海关监管特殊仓储）
    "Return Holding Area",              // 退换货暂存区（逆向物流处理区）

    /* Operational Processes */
    "Standard Packaging",              // 标准包装（符合ISO箱规尺寸）
    "Irregular Shape",                  // 异形货（需特殊搬运设备操作）
    "Heavy Cargo (>50kg)",             // 重货（需叉车/堆高机搬运）
    "Lightweight Cargo",               // 轻泡货（体积大重量轻商品）
    "Near Expiry (3M)",                // 近效期商品（3个月内过期隔离品）
    "Batch Traceability",              // 批次追溯（制药/食品行业强制要求）
    "Expiry Lockdown",                 // 效期锁定（禁止出库的临期商品）
    "Supplier Batch",                  // 供应商批次（按供应商管理库存）
    "Production Batch",                // 生产批次（同产线同批次商品）
    "Rework Batch",                    // 返工批次（质量返修后商品）
    "Customer-Owned Batch",            // 客供批次（客户提供原材料库存）

    /* Compliance & Safety */
    "Flammable Liquids",               // 易燃液体（UN1993危险品分类）
    "Corrosives",                      // 腐蚀品（需专用防腐容器存储）
    "Lithium Battery",                 // 锂电池（UN3480特殊运输品）
    "UN-Certified",                    // UN认证品（国际危险品运输标准）
    "Pending Full Inspection",         // 待全检（新品入库前质检状态）
    "Sampling Qualified",              // 抽样合格（批次抽样检测通过）
    "Inventory Freeze",                // 库存冻结（法律纠纷冻结状态）
    "Pending Destruction",             // 待销毁（过期/残次品处理流程）

    /* Inventory Strategies */
    "ABC Classification (A-Class)",   // ABC分类-A类（占80%出货量核心品）
    "FIFO",                           // 先进先出（食品/药品强制周转策略）
    "LIFO",                           // 后进先出（大宗商品价格波动策略）
    "Single SKU",                     // 单品管理（独立编码商品）
    "Combo Kit",                      // 组合套装（需拆解销售的礼盒装）
    "Virtual Assembly",               // 虚拟组合件（销售组合/独立存储）
    "Consumable Accessory",           // 耗材附属品（配套耗材关联管理）
    "Certified Return",               // 认证退货（质检合格可二次销售）
    "Refurbishable",                  // 可翻新品（外观瑕疵可修复商品）
    "Resalable",                      // 可二次销售（退货未拆封商品）
    "Defect Isolation",               // 残次隔离（质量问题商品专区）

    /* Equipment Integration */
    "AGV Compatible",                 // AGV兼容（自动化搬运系统支持）
    "Robotic Gripping Point",         // 机械臂抓取点（预设机械臂操作点位）
    "ASRS Pallet Code",               // 立体库托盘码（自动化立体仓专用标识）
    "Shockproof Packaging",           // 防震包装（精密仪器运输包装）
    "Tamper-Evident Seal",            // 防拆封签（高价值商品防篡改标识）
    "Cold Chain Gel Pack",            // 冷链蓄冷剂（生物制剂低温维持方案）
    "Wooden Crate Reinforced"         // 木箱加固（重型设备运输包装）
]

export const asnTypesOptions = [
    "inbound",                        // 入库单（入库操作单据）
    "return_from_customer",           // 退货单（客户退货单据）
    "transfer"                       // 调拨单（仓库间调拨单据）
]


export const dnTypesOptions = [
    "shipping",                        // 出库单（出库操作单据）
    "return_to_supplier",           // 退货单（供应商退货单据）
    "damage_to_supplier",           // 报损单（客户报损单据）
    "transfer"                       // 调拨单（仓库间调拨单据）
]

export const dnTransportationModesOptions = [
    'express',  // 快递运输
    'pickup', // 自提运输
    'courier',  // 专人专递
    'air',  // 空运运输
    'sea',  // 海运运输
    'land',  // 陆运运输
    'rail',  // 铁路运输
    'drone' ,  // 无人机运输
]

export const removalReasonsOptions = [
    'damaged',  // 损坏    
    'returned',  // 退货    
    'transfer',  // 调拨
    'picked',  // 拣货
    'expired',  // 过期
    'lost',  // 丢失
    'other',  // 其他
]

export const locationTypesOptions = [
    'standard',  // 标准库位
    'damaged',  // 损坏库位
    'return',  // 退货库位
]

export const staffRolesOptions = [
    'company_admin',  // 管理员
    'warehouse_admin',  // 仓库经理
    'warehouse_operator',  // 仓库员工
]