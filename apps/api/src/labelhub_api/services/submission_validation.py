from __future__ import annotations

from dataclasses import dataclass
import re
import unicodedata
from typing import Any

from labelhub_api.core.enums import TemplateComponentType
from labelhub_api.schemas.templates import TemplateComponentDTO, TemplateSchemaVO


COLLECTABLE_TYPES = {
    TemplateComponentType.TEXT_INPUT.value,
    TemplateComponentType.TEXTAREA.value,
    TemplateComponentType.RADIO.value,
    TemplateComponentType.CHECKBOX.value,
    TemplateComponentType.TAG_SELECT.value,
    TemplateComponentType.RICH_TEXT.value,
    TemplateComponentType.FILE_UPLOAD.value,
    TemplateComponentType.IMAGE_UPLOAD.value,
    TemplateComponentType.JSON_EDITOR.value,
}
MULTI_VALUE_TYPES = {
    TemplateComponentType.CHECKBOX.value,
    TemplateComponentType.TAG_SELECT.value,
}
UPLOAD_TYPES = {
    TemplateComponentType.FILE_UPLOAD.value,
    TemplateComponentType.IMAGE_UPLOAD.value,
}
TEXT_TYPES = {
    TemplateComponentType.TEXT_INPUT.value,
    TemplateComponentType.TEXTAREA.value,
    TemplateComponentType.RICH_TEXT.value,
}
URL_PATTERN = re.compile(r"(https?://|www\.)", re.IGNORECASE)


@dataclass(frozen=True)
class SubmissionValidationError:
    field_key: str
    message: str

    def to_dict(self) -> dict[str, str]:
        return {"fieldKey": self.field_key, "message": self.message}


@dataclass(frozen=True)
class SubmissionValidationResult:
    values: dict[str, Any]
    errors: list[SubmissionValidationError]

    def error_details(self) -> list[dict[str, str]]:
        return [error.to_dict() for error in self.errors]


def validate_submission_value(schema: TemplateSchemaVO, values: dict[str, Any]) -> SubmissionValidationResult:
    errors: list[SubmissionValidationError] = []
    components = [component for component in schema.components if _is_collectable(component)]
    components_by_key = {str(component.field_key): component for component in components if component.field_key}

    for field_key in values:
        if field_key not in components_by_key:
            errors.append(SubmissionValidationError(field_key=field_key, message="字段不在当前模板采集项中"))

    visible_components = [component for component in components if _is_visible(component, values)]
    visible_keys = {str(component.field_key) for component in visible_components if component.field_key}
    cleaned_values = {field_key: value for field_key, value in values.items() if field_key in visible_keys}

    for component in visible_components:
        field_key = str(component.field_key)
        field_value = values.get(field_key)
        required_when = _read_required_when(component.validation.get("requiredWhen"))
        required_when_active = _evaluate_rule_set(required_when, values, empty_fallback=False)
        if (component.validation.get("required") is True or required_when_active) and _is_empty(field_value):
            message = (
                str(required_when.get("message"))
                if required_when_active and isinstance(required_when.get("message"), str)
                else f"{component.label} 为必填项"
            )
            errors.append(SubmissionValidationError(field_key=field_key, message=message))
            continue

        if _is_empty(field_value):
            continue

        errors.extend(_validate_component_value(component, field_value))

    return SubmissionValidationResult(values=cleaned_values, errors=errors)


def _is_collectable(component: TemplateComponentDTO) -> bool:
    return bool(component.field_key) and component.type in COLLECTABLE_TYPES


def _is_visible(component: TemplateComponentDTO, values: dict[str, Any]) -> bool:
    return _evaluate_rule_set(_read_rule_set(component.visibility), values, empty_fallback=True)


def _validate_component_value(component: TemplateComponentDTO, value: Any) -> list[SubmissionValidationError]:
    field_key = str(component.field_key)
    errors: list[SubmissionValidationError] = []

    if component.type in TEXT_TYPES and not isinstance(value, str):
        errors.append(SubmissionValidationError(field_key=field_key, message=f"{component.label} 必须是文本"))
        return errors

    if component.type == TemplateComponentType.RADIO.value:
        if not isinstance(value, str):
            return [SubmissionValidationError(field_key=field_key, message=f"{component.label} 必须选择一个选项")]
        errors.extend(_validate_option_values(component, [value]))

    if component.type in MULTI_VALUE_TYPES:
        if not _is_string_list(value):
            return [SubmissionValidationError(field_key=field_key, message=f"{component.label} 必须是选项数组")]
        errors.extend(_validate_option_values(component, value))

    if component.type == TemplateComponentType.JSON_EDITOR.value and (
        not isinstance(value, dict) or isinstance(value, list)
    ):
        errors.append(SubmissionValidationError(field_key=field_key, message=f"{component.label} 必须是 JSON Object"))

    if component.type in UPLOAD_TYPES:
        file_refs = _read_file_references(value)
        if file_refs is None:
            return [SubmissionValidationError(field_key=field_key, message=f"{component.label} 必须是文件引用数组")]
        if any(not item["id"].startswith("file_") for item in file_refs):
            errors.append(SubmissionValidationError(field_key=field_key, message=f"{component.label} 必须使用已上传文件引用"))
        max_files = _read_int(component.props.get("maxFiles"))
        if max_files is not None and len(file_refs) > max_files:
            errors.append(SubmissionValidationError(field_key=field_key, message=f"{component.label} 最多上传 {max_files} 个文件"))
        max_size_mb = _read_int(component.props.get("maxSizeMb"))
        if max_size_mb is not None:
            max_size_bytes = max_size_mb * 1024 * 1024
            if any(isinstance(item.get("sizeBytes"), int) and item["sizeBytes"] > max_size_bytes for item in file_refs):
                errors.append(SubmissionValidationError(field_key=field_key, message=f"{component.label} 单个文件不能超过 {max_size_mb} MB"))
        accept = _effective_upload_accept(component.type, _read_string_array(component.props.get("accept")))
        if accept:
            invalid_type = any(
                not _matches_accept(str(item.get("fileName") or item["id"]), item.get("mimeType"), accept)
                for item in file_refs
                if item.get("mimeType") or item.get("fileName")
            )
            if invalid_type:
                errors.append(SubmissionValidationError(field_key=field_key, message=f"{component.label} 包含不支持的文件类型"))
        if component.type == TemplateComponentType.IMAGE_UPLOAD.value:
            invalid_image = any(
                isinstance(item.get("mimeType"), str) and not str(item["mimeType"]).lower().startswith("image/")
                for item in file_refs
            )
            if invalid_image:
                errors.append(SubmissionValidationError(field_key=field_key, message=f"{component.label} 只能上传图片文件"))

    errors.extend(_validate_common_rules(component, value))
    return errors


def _validate_common_rules(component: TemplateComponentDTO, value: Any) -> list[SubmissionValidationError]:
    if not isinstance(value, str):
        if "JSON_OBJECT" in _read_string_array(component.validation.get("customRuleIds")) and (
            not isinstance(value, dict) or isinstance(value, list)
        ):
            return [
                SubmissionValidationError(
                    field_key=str(component.field_key),
                    message=f"{component.label} 必须是 JSON Object",
                )
            ]
        return []

    errors: list[SubmissionValidationError] = []
    field_key = str(component.field_key)
    max_length = _read_int(component.validation.get("maxLength"))
    if max_length is not None and len(value) > max_length:
        errors.append(SubmissionValidationError(field_key=field_key, message=f"{component.label} 不能超过 {max_length} 字"))

    pattern = component.validation.get("pattern")
    if isinstance(pattern, str) and value:
        try:
            if not re.search(pattern, value):
                pattern_message = component.validation.get("patternMessage")
                errors.append(
                    SubmissionValidationError(
                        field_key=field_key,
                        message=str(pattern_message) if isinstance(pattern_message, str) else f"{component.label} 格式不符合要求",
                    )
                )
        except re.error:
            errors.append(SubmissionValidationError(field_key=field_key, message=f"{component.label} 的正则配置无效"))

    for rule_id in _read_string_array(component.validation.get("customRuleIds")):
        message = _validate_custom_rule(rule_id, value, component.label)
        if message:
            errors.append(SubmissionValidationError(field_key=field_key, message=message))

    return errors


def _validate_option_values(component: TemplateComponentDTO, values: list[str]) -> list[SubmissionValidationError]:
    allowed_values = {option["value"] for option in _read_options(component)}
    if not allowed_values:
        return []
    invalid_values = [value for value in values if value not in allowed_values]
    if invalid_values:
        return [
            SubmissionValidationError(
                field_key=str(component.field_key),
                message=f"{component.label} 包含不在模板中的选项",
            )
        ]
    return []


def _read_options(component: TemplateComponentDTO) -> list[dict[str, str]]:
    options = component.props.get("options")
    if not isinstance(options, list):
        return []
    normalized: list[dict[str, str]] = []
    for option in options:
        if not isinstance(option, dict):
            continue
        label = option.get("label")
        value = option.get("value")
        if isinstance(label, str) and isinstance(value, str) and label and value:
            normalized.append({"label": label, "value": value})
    return normalized


def _read_rule_set(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    logic = "ANY" if value.get("logic") == "ANY" else "ALL"
    conditions = value.get("conditions")
    normalized_conditions = [_read_condition(item) for item in conditions] if isinstance(conditions, list) else []
    return {"logic": logic, "conditions": [item for item in normalized_conditions if item is not None]}


def _read_required_when(value: Any) -> dict[str, Any] | None:
    rule_set = _read_rule_set(value)
    if rule_set is None:
        return None
    if isinstance(value, dict) and isinstance(value.get("message"), str):
        rule_set["message"] = value["message"]
    return rule_set


def _read_condition(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    field_key = value.get("fieldKey")
    operator = value.get("operator")
    if not isinstance(field_key, str) or operator not in {"EQUALS", "NOT_EQUALS", "IN", "NOT_IN", "NOT_EMPTY", "EMPTY"}:
        return None
    return {"fieldKey": field_key, "operator": operator, "value": value.get("value")}


def _evaluate_rule_set(rule_set: dict[str, Any] | None, values: dict[str, Any], *, empty_fallback: bool) -> bool:
    conditions = rule_set.get("conditions", []) if rule_set else []
    if not conditions:
        return empty_fallback
    results = [_evaluate_condition(condition, values) for condition in conditions]
    return any(results) if rule_set.get("logic") == "ANY" else all(results)


def _evaluate_condition(condition: dict[str, Any], values: dict[str, Any]) -> bool:
    current_value = values.get(str(condition.get("fieldKey")))
    expected_value = condition.get("value")
    operator = condition.get("operator")
    if operator == "EQUALS":
        return _scalar_equals(current_value, expected_value)
    if operator == "NOT_EQUALS":
        return not _scalar_equals(current_value, expected_value)
    if operator == "IN":
        return _any_current_value_in_expected(current_value, expected_value)
    if operator == "NOT_IN":
        return not _any_current_value_in_expected(current_value, expected_value)
    if operator == "NOT_EMPTY":
        return not _is_empty(current_value)
    if operator == "EMPTY":
        return _is_empty(current_value)
    return False


def _scalar_equals(current_value: Any, expected_value: Any) -> bool:
    if isinstance(current_value, list):
        return _stringify(expected_value) in {_stringify(item) for item in current_value}
    return current_value == expected_value or _stringify(current_value) == _stringify(expected_value)


def _any_current_value_in_expected(current_value: Any, expected_value: Any) -> bool:
    expected_values = {str(item) for item in _read_string_array(expected_value)}
    if not expected_values:
        return False
    current_values = current_value if isinstance(current_value, list) else [current_value]
    return any(_stringify(item) in expected_values for item in current_values)


def _validate_custom_rule(rule_id: str, value: str, label: str) -> str | None:
    if not value:
        return None
    if rule_id == "NO_EMOJI" and _has_emoji(value):
        return f"{label} 不能包含 Emoji"
    if rule_id == "NO_URL" and URL_PATTERN.search(value):
        return f"{label} 不能包含链接"
    if rule_id == "TRIMMED_NON_EMPTY" and not value.strip():
        return f"{label} 不能只包含空白字符"
    if rule_id == "JSON_OBJECT":
        return f"{label} 必须是 JSON Object"
    return None


def _has_emoji(value: str) -> bool:
    return any(unicodedata.category(char) == "So" and ord(char) > 0x2600 for char in value)


def _is_empty(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return len(value.strip()) == 0
    if isinstance(value, (list, tuple, set, dict)):
        return len(value) == 0
    return False


def _is_string_list(value: Any) -> bool:
    return isinstance(value, list) and all(isinstance(item, str) and item.strip() for item in value)


def _read_file_references(value: Any) -> list[dict[str, Any]] | None:
    if not isinstance(value, list):
        return None
    refs: list[dict[str, Any]] = []
    for item in value:
        if isinstance(item, str) and item.strip():
            refs.append({"id": item.strip()})
            continue
        if isinstance(item, dict) and isinstance(item.get("id"), str) and item["id"].strip():
            refs.append(
                {
                    "id": item["id"].strip(),
                    "fileName": item.get("fileName"),
                    "mimeType": item.get("mimeType"),
                    "sizeBytes": item.get("sizeBytes"),
                }
            )
            continue
        return None
    return refs


def _read_string_array(value: Any) -> list[str]:
    return [item for item in value if isinstance(item, str)] if isinstance(value, list) else []


def _read_int(value: Any) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def _stringify(value: Any) -> str:
    return "" if value is None else str(value)


def _matches_accept(file_name: str, mime_type: Any, accept: list[str]) -> bool:
    name = file_name.lower()
    mime = str(mime_type or "").lower()
    for rule in accept:
        normalized = rule.strip().lower()
        if not normalized:
            continue
        if normalized.startswith(".") and name.endswith(normalized):
            return True
        if normalized.endswith("/*") and mime.startswith(normalized[:-1]):
            return True
        if mime and mime == normalized:
            return True
    return False


def _effective_upload_accept(component_type: str, accept: list[str]) -> list[str]:
    if component_type != TemplateComponentType.FILE_UPLOAD.value or not accept:
        return accept
    normalized = [item.strip().lower() for item in accept if item.strip()]
    legacy_document_rules = {".pdf", ".docx", ".xlsx", ".json", ".txt"}
    is_legacy_document_accept = (
        bool(normalized)
        and all(item in legacy_document_rules or item == ".md" for item in normalized)
        and all(item in normalized for item in [".pdf", ".docx", ".xlsx", ".json"])
    )
    return [*accept, ".md"] if is_legacy_document_accept and ".md" not in normalized else accept
