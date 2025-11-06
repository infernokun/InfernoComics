from __future__ import annotations

import json
import yaml

from typing import Dict, Any, Optional
from dataclasses import dataclass, field, fields

def _alias(name: str):
    return {"alias": name}

def _field(default_factory, alias: Optional[str] = None):
    meta = {"alias": alias} if alias else {}
    return field(default_factory=default_factory, metadata=meta)

def _map_aliases(obj) -> Dict[str, Any]:
    result = {}
    for f in fields(obj):
        value = getattr(obj, f.name)
        if hasattr(value, "__dataclass_fields__"):
            value = _map_aliases(value)
        elif isinstance(value, dict):
            value = {
                k: _map_aliases(v) if hasattr(v, "__dataclass_fields__") else v
                for k, v in value.items()
            }
        key = f.metadata.get("alias", f.name)
        result[key] = value
    return result

def _from_dict(cls, data: Dict[str, Any]):
    init_kwargs = {}
    for f in fields(cls):
        json_key = f.metadata.get("alias", f.name)
        if json_key not in data:
            continue
        raw_val = data[json_key]
        if hasattr(f.type, "__dataclass_fields__"):
            init_kwargs[f.name] = _from_dict(f.type, raw_val)
        elif (
            getattr(f.type, "__origin__", None) is dict
            and hasattr(f.type.__args__[1], "__dataclass_fields__")
        ):
            inner_type = f.type.__args__[1]
            init_kwargs[f.name] = {
                k: _from_dict(inner_type, v) for k, v in raw_val.items()
            }
        else:
            init_kwargs[f.name] = raw_val
    return cls(**init_kwargs)

@dataclass
class Options:
    use_advanced_matching: bool = field(metadata=_alias("use_advanced_matching"))
    use_comic_detection: bool = field(metadata=_alias("use_comic_detection"))
    cache_only: Optional[bool] = field(
        default=False, metadata=_alias("cache_only")
    )

@dataclass
class RecognitionPreset:
    image_size: int = field(metadata=_alias("image_size"))
    max_workers: int = field(metadata=_alias("max_workers"))

    detectors: Dict[str, int] = _field(dict)
    feature_weights: Dict[str, float] = _field(dict, alias="feature_weights")
    options: Options = field(default_factory=Options)

@dataclass
class RecognitionConfig:
    performance_level: Optional[str] = field(
        default=None, metadata=_alias("performance_level")
    )
    result_batch: Optional[int] = field(
        default=None, metadata=_alias("result_batch")
    )
    presets: Dict[str, RecognitionPreset] = _field(dict)
    similarity_threshold: Optional[str] = field(
        default=None, metadata=_alias("similarity_threshold")
    )

    def to_json(self, *, indent: int = 2) -> str:
        return json.dumps(_map_aliases(self), indent=indent)

    @classmethod
    def from_json(cls, payload: str) -> "RecognitionConfig":
        data = json.loads(payload)
        return _from_dict(cls, data)
    
    def to_yml(self, *, indent: int = 2) -> str:
        raw_dict = _map_aliases(self)

        return yaml.safe_dump(
            raw_dict,
            default_flow_style=False,
            sort_keys=False,
            indent=indent,
            allow_unicode=True,
        )