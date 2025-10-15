export interface User {
    id: string;
    user_name: string;
    email: string;
    roles: string[];
    avata?: string;
    type: string;
}

export interface Staff {
    id: number;
    user_name: string;
    email: string;
    roles: string[];
    is_active: boolean;
    phone: string;
    position: string;
    employee_number: string;
    openid: string;
    hire_date: string;    // 日期字符串格式YYYY-MM-DD
    company_id: number;
    department_id: number;

    // 嵌套对象类型定义
    company: CompanySimple;
    department: DepartmentSimple;
    warehouses: WarehouseSimple[];
}

// 嵌套接口定义
export interface CompanySimple {
    id: number;
    name: string;
    logo: string | null;  // 允许空值
    default_currency: string | null; // 允许空值
    expired_at: string | null;
}

export interface DepartmentSimple {
    id: number;
    name: string;
}

export interface WarehouseSimple {
    id: number;
    name: string;
    default_currency: string | null; // 允许空值
}

// 添加类型定义
export interface Goods {
    id: number;
    code: string;
    name: string;
    thumbnail_url?: string;
  }
  
export interface GoodsSearchState {
    code: string;
    results: Goods[];
    total: number;
    loading: boolean;
    selected: {
      goods: Goods | null;
      id: number | null;
      qty: number | null;
      weight: number | null;
      volume: number | null;
      remark: string;
    }
  }

// // 商品基础接口
// export interface Goods {
//     name: string | null
//     code: string | null
//     category: string | null
//     brand: string | null
//     manufacturer: string | null
//     tags: string[]         
//     description: string | null
//     price: number | null
//     discount_price: number | null
//     currency: string        
//     unit: string            
//     weight: number | null
//     length: number | null
//     width: number | null
//     height: number | null
//     image_url: string | null
//     thumbnail_url: string | null
//     extra_data: Record<string, any> 
//     production_date: string | null
//     expiration_date: string | null
//     company_id: number | null
// }


// // 定义ASN明细项接口
// export interface AsnDetail {
//     goods_id: number | null
//     quantity: number | null
//     actual_quantity?: number | null
//     sorted_quantity?: number | null
//     damage_quantity?: number | null
//     weight?: number | null
//     volume?: number | null
//     remark?: string | null
// }

// // 定义主表单接口
// export interface Asn {
//     supplier_id: number | null
//     tracking_number: string | null
//     carrier_id: number | null
//     asn_type: string
//     status: string
//     expected_arrival_date: string | null
//     actual_arrival_date: string | null
//     remark: string | null
//     is_active: boolean
//     warehouse_id: number | null
//     details: AsnDetail[]
// }