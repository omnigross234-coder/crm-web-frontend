"use client";

import { api, ApiResponse } from "@/lib/api";

export type LeadExtraFieldKey = string;

export type LeadExtraFieldType = "text" | "textarea" | "number" ;

export interface LeadExtraFieldDefinition {
  key: LeadExtraFieldKey;
  label: string;
  type: LeadExtraFieldType;
}

export interface LeadFieldSetting {
  key: LeadExtraFieldKey;
  label: string;
  type: LeadExtraFieldType;
  active: boolean;
  required: boolean;
  isCustom?: boolean;
}

interface LeadFieldSettingResponse {
  key?: LeadExtraFieldKey;
  field_key?: LeadExtraFieldKey;
  label?: string;
  type?: LeadExtraFieldType;
  field_type?: LeadExtraFieldType;
  active?: boolean | number;
  is_active?: boolean | number;
  required?: boolean | number;
  is_required?: boolean | number;
  isCustom?: boolean;
  is_custom?: boolean;
  sort_order?: number;
}

export const LEAD_EXTRA_FIELDS: LeadExtraFieldDefinition[] = [
  { key: "address", label: "Address", type: "textarea" },
  { key: "city", label: "City", type: "text" },
  { key: "state", label: "State", type: "text" },
  { key: "country", label: "Country", type: "text" },
  { key: "pin_code", label: "PIN Code", type: "text" },
  { key: "referral_name", label: "Referral Name", type: "text" },
  { key: "industry_type", label: "Industry Type", type: "text" },
  { key: "business_type", label: "Business Type", type: "text" },
  { key: "product_service_interested_in", label: "Product/Service Interested In", type: "text" },
  { key: "budget", label: "Budget", type: "text" },
  { key: "documents", label: "Documents", type: "textarea" },
  { key: "annual_turnover", label: "Annual Turnover", type: "text" },
  { key: "gst_number", label: "GST Number", type: "text" },
  { key: "requirement", label: "Requirement", type: "textarea" },
];

const STORAGE_KEY = "crm_lead_field_settings";

export const DEFAULT_LEAD_FIELD_SETTINGS: LeadFieldSetting[] = LEAD_EXTRA_FIELDS.map((field) => ({
  key: field.key,
  label: field.label,
  type: field.type,
  active: true,
  required: false,
  isCustom: false,
}));

function mergeWithDefaults(settings: Partial<LeadFieldSetting>[]): LeadFieldSetting[] {
  const defaults = DEFAULT_LEAD_FIELD_SETTINGS.map((fallback) => {
    const saved = settings.find((item) => item.key === fallback.key);
    return {
      key: fallback.key,
      label: saved?.label ?? fallback.label,
      type: saved?.type ?? fallback.type,
      active: saved?.active ?? fallback.active,
      required: saved?.required ?? fallback.required,
      isCustom: saved?.isCustom ?? fallback.isCustom,
    };
  });
  const custom = settings
    .filter((item) => item.key && !defaults.some((fallback) => fallback.key === item.key))
    .map((item) => ({
      key: item.key as string,
      label: item.label ?? item.key ?? "Custom Field",
      type: item.type ?? "text",
      active: item.active ?? true,
      required: item.required ?? false,
      isCustom: item.isCustom ?? true,
    }));

  return [...defaults, ...custom];
}

export function getLeadFieldSettings(): LeadFieldSetting[] {
  if (typeof window === "undefined") return DEFAULT_LEAD_FIELD_SETTINGS;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LEAD_FIELD_SETTINGS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_LEAD_FIELD_SETTINGS;
    return mergeWithDefaults(parsed);
  } catch {
    return DEFAULT_LEAD_FIELD_SETTINGS;
  }
}

export function saveLeadFieldSettings(settings: LeadFieldSetting[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function clearLeadFieldSettings() {
  localStorage.removeItem(STORAGE_KEY);
}

type LeadFieldSettingsData =
  | LeadFieldSettingResponse[]
  | { fields?: LeadFieldSettingResponse[]; settings?: LeadFieldSettingResponse[] }
  | null
  | undefined;

function responseSettings(data: LeadFieldSettingsData): LeadFieldSettingResponse[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.fields)) return data.fields;
  if (Array.isArray(data?.settings)) return data.settings;
  return [];
}

function apiBoolean(value: boolean | number | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === true || value === 1;
}

function fromApi(settings: LeadFieldSettingResponse[] | null | undefined): LeadFieldSetting[] {
  if (!Array.isArray(settings)) return [];

  return settings.filter((setting) => Boolean(setting.key ?? setting.field_key)).map((setting) => ({
    key: (setting.key ?? setting.field_key) as LeadExtraFieldKey,
    label: setting.label ?? setting.key ?? setting.field_key ?? "Field",
    type: setting.type ?? setting.field_type ?? "text",
    active: apiBoolean(setting.active ?? setting.is_active, true),
    required: apiBoolean(setting.required ?? setting.is_required, false),
    isCustom: setting.isCustom ?? setting.is_custom,
  }));
}

export async function fetchLeadFieldSettings(): Promise<LeadFieldSetting[]> {
  try {
    const res = await api.get<ApiResponse<LeadFieldSettingsData>>("/lead-field-settings");
    const settings = fromApi(responseSettings(res.data));
    if (settings.length === 0) return DEFAULT_LEAD_FIELD_SETTINGS;
    saveLeadFieldSettings(settings);
    return settings;
  } catch {
    // Keep the last successfully saved configuration usable while the remote
    // settings read endpoint is temporarily unavailable.
    return getLeadFieldSettings();
  }
}

export async function updateLeadFieldSettings(settings: LeadFieldSetting[]): Promise<LeadFieldSetting[]> {
  const fields = settings.map((setting) => ({
      key: setting.key,
      field_key: setting.key,
      active: setting.active,
      is_active: setting.active,
      required: setting.required,
      is_required: setting.required,
    }));

  const updateResponse = await api.put<ApiResponse<LeadFieldSettingsData>>("/lead-field-settings", {
    fields,
    settings: fields,
  });

  let verified = fromApi(responseSettings(updateResponse.data));

  if (verified.length === 0) {
    try {
      const verifiedResponse = await api.get<ApiResponse<LeadFieldSettingsData>>(
        `/lead-field-settings?fresh=${Date.now()}`
      );
      verified = fromApi(responseSettings(verifiedResponse.data));
    } catch {
      // The update succeeded, but some deployments currently fail while
      // reading settings. Retain the submitted values until reads recover.
      saveLeadFieldSettings(settings);
      return settings;
    }
  }

  if (verified.length === 0) {
    saveLeadFieldSettings(settings);
    return settings;
  }

  const verifiedByKey = new Map(verified.map((setting) => [setting.key, setting]));
  const mismatch = settings.find((setting) => {
    const saved = verifiedByKey.get(setting.key);
    return !saved || saved.active !== setting.active || saved.required !== setting.required;
  });

  if (mismatch) {
    throw new Error(`The server did not save the setting for ${mismatch.label}. Please check the backend update endpoint.`);
  }

  saveLeadFieldSettings(verified);
  return verified;
}

export async function createLeadFieldSetting(input: {
  label: string;
  type: LeadExtraFieldType;
  required: boolean;
}): Promise<LeadFieldSetting[]> {
  const res = await api.post<ApiResponse<LeadFieldSettingResponse[]>>("/lead-field-settings", {
    label: input.label,
    type: input.type,
    required: input.required,
  });
  const saved = fromApi(res.data);
  saveLeadFieldSettings(saved);
  return saved;
}

export async function deleteLeadFieldSetting(key: string): Promise<LeadFieldSetting[]> {
  const res = await api.delete<ApiResponse<LeadFieldSettingResponse[]>>(
    `/lead-field-settings/${encodeURIComponent(key)}`
  );
  const saved = fromApi(res.data);
  saveLeadFieldSettings(saved);
  return saved;
}
