# collectors/reputation_analyzer.py
"""
Reputation Analysis Engine
Integrates with VirusTotal and AbuseIPDB for IP/domain reputation scoring
Provides automatic threat intelligence correlation and verification
"""

import asyncio
import aiohttp
import time
from typing import Dict, Any, Optional, List
from dataclasses import dataclass
from datetime import datetime, timedelta
import hashlib


@dataclass
class ReputationScore:
    """Reputation data for IP/domain"""
    entity: str  # IP or domain
    entity_type: str  # "ip" or "domain"
    virustotal_score: float  # 0-1 (0=clean, 1=malicious)
    virustotal_detections: int  # Number of vendors detecting as malicious
    abuseipdb_score: float  # 0-100 (0=clean, 100=very malicious)
    abuseipdb_reports: int  # Number of reports on AbuseIPDB
    combined_risk_score: float  # 0-100 (aggregated score)
    is_blacklisted: bool
    threat_types: List[str]  # ['malware', 'phishing', 'botnet', etc.]
    last_analysis_date: Optional[str]
    is_cached: bool
    confidence: float  # 0-1 (how recent is the data)
    metadata: Dict[str, Any]


class ReputationAnalyzer:
    """
    Reputation Analysis Engine with VirusTotal and AbuseIPDB Integration
    Caches results to minimize API calls and rate-limit compliance
    """

    def __init__(
        self,
        virustotal_api_key: Optional[str] = None,
        abuseipdb_api_key: Optional[str] = None,
        cache_ttl_hours: int = 24,
    ):
        """
        Initialize reputation analyzer

        Args:
            virustotal_api_key: VirusTotal API key
            abuseipdb_api_key: AbuseIPDB API key
            cache_ttl_hours: Cache time-to-live in hours
        """
        self.vt_api_key = virustotal_api_key
        self.abuseipdb_api_key = abuseipdb_api_key
        self.cache_ttl = timedelta(hours=cache_ttl_hours)

        # Local cache: {entity: (score, timestamp)}
        self.reputation_cache: Dict[str, tuple] = {}

        # Statistics
        self.vt_api_calls = 0
        self.abuseipdb_api_calls = 0
        self.cache_hits = 0
        self.cache_misses = 0

        # Rate limiting (API quotas)
        self.vt_rate_limit = 4  # requests per minute
        self.abuseipdb_rate_limit = 15  # requests per day
        self.vt_last_request = 0
        self.abuseipdb_calls_today = 0
        self.abuseipdb_reset_time = time.time() + 86400  # 24 hours

    async def analyze_ip(self, ip: str) -> ReputationScore:
        """
        Analyze IP reputation

        Args:
            ip: IP address to analyze

        Returns:
            ReputationScore object with threat intel data
        """
        # Check cache first
        cached = self._get_cached_score(ip)
        if cached:
            return cached

        self.cache_misses += 1

        # Parallel API calls
        vt_result = await self._query_virustotal_ip(ip)
        abuseipdb_result = await self._query_abuseipdb_ip(ip)

        # Combine results
        score = self._combine_reputation_scores(
            ip, "ip", vt_result, abuseipdb_result
        )

        # Cache result
        self._cache_score(ip, score)

        return score

    async def analyze_domain(self, domain: str) -> ReputationScore:
        """
        Analyze domain reputation

        Args:
            domain: Domain to analyze

        Returns:
            ReputationScore object with threat intel data
        """
        # Check cache first
        cached = self._get_cached_score(domain)
        if cached:
            return cached

        self.cache_misses += 1

        # Query VirusTotal for domain (AbuseIPDB is IP-only)
        vt_result = await self._query_virustotal_domain(domain)

        # Combine results
        score = self._combine_reputation_scores(
            domain, "domain", vt_result, None
        )

        # Cache result
        self._cache_score(domain, score)

        return score

    async def _query_virustotal_ip(self, ip: str) -> Dict[str, Any]:
        """Query VirusTotal for IP reputation"""
        if not self.vt_api_key:
            return {"error": "VirusTotal API key not configured"}

        # Rate limiting
        time_since_last = time.time() - self.vt_last_request
        if time_since_last < 60 / self.vt_rate_limit:
            await asyncio.sleep(60 / self.vt_rate_limit - time_since_last)

        try:
            async with aiohttp.ClientSession() as session:
                url = f"https://www.virustotal.com/api/v3/ip_addresses/{ip}"
                headers = {"x-apikey": self.vt_api_key}

                async with session.get(url, headers=headers, timeout=10) as resp:
                    self.vt_api_calls += 1
                    self.vt_last_request = time.time()

                    if resp.status == 200:
                        data = await resp.json()
                        return self._parse_virustotal_response(data)
                    elif resp.status == 404:
                        return {"status": "not_found", "detections": 0}
                    else:
                        return {
                            "error": f"VT API error: {resp.status}",
                            "detections": 0,
                        }
        except asyncio.TimeoutError:
            return {"error": "VT API timeout", "detections": 0}
        except Exception as e:
            return {"error": f"VT API error: {str(e)}", "detections": 0}

    async def _query_virustotal_domain(self, domain: str) -> Dict[str, Any]:
        """Query VirusTotal for domain reputation"""
        if not self.vt_api_key:
            return {"error": "VirusTotal API key not configured"}

        # Rate limiting
        time_since_last = time.time() - self.vt_last_request
        if time_since_last < 60 / self.vt_rate_limit:
            await asyncio.sleep(60 / self.vt_rate_limit - time_since_last)

        try:
            async with aiohttp.ClientSession() as session:
                url = f"https://www.virustotal.com/api/v3/domains/{domain}"
                headers = {"x-apikey": self.vt_api_key}

                async with session.get(url, headers=headers, timeout=10) as resp:
                    self.vt_api_calls += 1
                    self.vt_last_request = time.time()

                    if resp.status == 200:
                        data = await resp.json()
                        return self._parse_virustotal_response(data)
                    elif resp.status == 404:
                        return {"status": "not_found", "detections": 0}
                    else:
                        return {
                            "error": f"VT API error: {resp.status}",
                            "detections": 0,
                        }
        except asyncio.TimeoutError:
            return {"error": "VT API timeout", "detections": 0}
        except Exception as e:
            return {"error": f"VT API error: {str(e)}", "detections": 0}

    async def _query_abuseipdb_ip(self, ip: str) -> Dict[str, Any]:
        """Query AbuseIPDB for IP reputation"""
        if not self.abuseipdb_api_key:
            return {"error": "AbuseIPDB API key not configured"}

        # Daily rate limiting
        if time.time() > self.abuseipdb_reset_time:
            self.abuseipdb_calls_today = 0
            self.abuseipdb_reset_time = time.time() + 86400

        if self.abuseipdb_calls_today >= self.abuseipdb_rate_limit:
            return {
                "error": "AbuseIPDB daily limit reached",
                "abuseConfidenceScore": 0,
            }

        try:
            async with aiohttp.ClientSession() as session:
                url = "https://api.abuseipdb.com/api/v2/check"
                headers = {
                    "Key": self.abuseipdb_api_key,
                    "Accept": "application/json",
                }
                params = {
                    "ipAddress": ip,
                    "maxAgeInDays": 90,
                    "verbose": "",
                }

                async with session.get(
                    url, headers=headers, params=params, timeout=10
                ) as resp:
                    self.abuseipdb_calls_today += 1

                    if resp.status == 200:
                        data = await resp.json()
                        return self._parse_abuseipdb_response(data)
                    else:
                        return {
                            "error": f"AbuseIPDB API error: {resp.status}",
                            "abuseConfidenceScore": 0,
                        }
        except asyncio.TimeoutError:
            return {"error": "AbuseIPDB API timeout", "abuseConfidenceScore": 0}
        except Exception as e:
            return {
                "error": f"AbuseIPDB API error: {str(e)}",
                "abuseConfidenceScore": 0,
            }

    def _parse_virustotal_response(self, data: Dict) -> Dict[str, Any]:
        """Parse VirusTotal API response"""
        try:
            if "error" in data:
                return {"error": str(data["error"]), "detections": 0}

            attributes = data.get("data", {}).get("attributes", {})
            last_analysis = attributes.get("last_analysis_stats", {})

            malicious_count = last_analysis.get("malicious", 0)
            total_vendors = (
                last_analysis.get("malicious", 0)
                + last_analysis.get("suspicious", 0)
                + last_analysis.get("undetected", 0)
                + last_analysis.get("harmless", 0)
            )

            detection_ratio = (
                malicious_count / total_vendors if total_vendors > 0 else 0
            )

            # Extract threat types
            threat_types = []
            categories = attributes.get("categories", {})
            if categories:
                threat_types = [cat for cat, val in categories.items() if val]

            return {
                "detections": malicious_count,
                "detection_ratio": detection_ratio,
                "total_vendors": total_vendors,
                "threat_types": threat_types,
                "last_analysis_date": attributes.get("last_analysis_date"),
                "is_blacklisted": malicious_count > 0,
            }
        except Exception as e:
            return {"error": str(e), "detections": 0}

    def _parse_abuseipdb_response(self, data: Dict) -> Dict[str, Any]:
        """Parse AbuseIPDB API response"""
        try:
            if "error" in data:
                return {
                    "error": str(data["error"]),
                    "abuseConfidenceScore": 0,
                }

            abusedata = data.get("data", {})

            # Extract threat types from usage type
            threat_types = []
            usage_type = abusedata.get("usageType", "")
            if "proxy" in usage_type.lower():
                threat_types.append("proxy")
            if "vpn" in usage_type.lower():
                threat_types.append("vpn")
            if "datacenter" in usage_type.lower():
                threat_types.append("datacenter")

            # Extract report categories
            for report in abusedata.get("reports", [])[:5]:  # Last 5 reports
                category = report.get("category", "")
                if category:
                    threat_types.append(self._map_abuseipdb_category(category))

            return {
                "abuseConfidenceScore": abusedata.get("abuseConfidenceScore", 0),
                "reports": len(abusedata.get("reports", [])),
                "threat_types": threat_types,
                "is_whitelisted": abusedata.get("isWhitelisted", False),
                "is_blacklisted": abusedata.get("abuseConfidenceScore", 0) > 25,
            }
        except Exception as e:
            return {
                "error": str(e),
                "abuseConfidenceScore": 0,
            }

    def _combine_reputation_scores(
        self,
        entity: str,
        entity_type: str,
        vt_result: Dict[str, Any],
        abuseipdb_result: Optional[Dict[str, Any]],
    ) -> ReputationScore:
        """Combine multiple reputation scores into single risk assessment"""
        # VirusTotal score (0-1)
        vt_score = vt_result.get("detection_ratio", 0)

        # AbuseIPDB score (0-100 -> 0-1)
        abuseipdb_score = abuseipdb_result.get("abuseConfidenceScore", 0) / 100 \
            if abuseipdb_result else 0

        # Combined score (weighted average, skewed toward highest risk)
        if abuseipdb_result:
            # Both scores available
            combined = max(vt_score, abuseipdb_score) * 0.7 + \
                      (vt_score + abuseipdb_score) / 2 * 0.3
        else:
            # Only VT available
            combined = vt_score

        # Convert to 0-100 scale
        combined_risk_score = combined * 100

        # Aggregate threat types
        threat_types = vt_result.get("threat_types", [])
        if abuseipdb_result:
            threat_types.extend(abuseipdb_result.get("threat_types", []))
        threat_types = list(set(threat_types))  # Remove duplicates

        # Determine if blacklisted
        is_blacklisted = (
            vt_result.get("is_blacklisted", False)
            or (
                abuseipdb_result.get("is_blacklisted", False)
                if abuseipdb_result
                else False
            )
        )

        return ReputationScore(
            entity=entity,
            entity_type=entity_type,
            virustotal_score=vt_score,
            virustotal_detections=vt_result.get("detections", 0),
            abuseipdb_score=abuseipdb_result.get("abuseConfidenceScore", 0)
            if abuseipdb_result
            else 0,
            abuseipdb_reports=abuseipdb_result.get("reports", 0)
            if abuseipdb_result
            else 0,
            combined_risk_score=combined_risk_score,
            is_blacklisted=is_blacklisted,
            threat_types=threat_types,
            last_analysis_date=vt_result.get("last_analysis_date"),
            is_cached=False,
            confidence=0.9 if not ("error" in vt_result or "error" in (abuseipdb_result or {})) else 0.3,
            metadata={
                "vt_api_calls": self.vt_api_calls,
                "abuseipdb_api_calls": self.abuseipdb_api_calls,
                "cache_hits": self.cache_hits,
                "sources": [
                    "virustotal" if "detection_ratio" in vt_result else None,
                    "abuseipdb"
                    if abuseipdb_result and "abuseConfidenceScore" in abuseipdb_result
                    else None,
                ],
            },
        )

    def _cache_score(self, entity: str, score: ReputationScore):
        """Cache reputation score"""
        self.reputation_cache[entity] = (score, time.time())

    def _get_cached_score(self, entity: str) -> Optional[ReputationScore]:
        """Retrieve cached reputation score if still valid"""
        if entity not in self.reputation_cache:
            return None

        score, timestamp = self.reputation_cache[entity]
        if time.time() - timestamp > self.cache_ttl.total_seconds():
            del self.reputation_cache[entity]
            return None

        self.cache_hits += 1
        score.is_cached = True
        return score

    def _map_abuseipdb_category(self, category_code: str) -> str:
        """Map AbuseIPDB category codes to human-readable names"""
        categories = {
            "Hacker": "hacker",
            "Spammer": "spammer",
            "Spam Server": "spam_server",
            "Phishing": "phishing",
            "Malware": "malware",
            "Botnet": "botnet",
            "Scammer": "scammer",
            "Compromised Server": "compromised",
            "Web Scraper": "scraper",
            "Other": "other",
        }
        return categories.get(category_code, "unknown")

    def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        total_lookups = self.cache_hits + self.cache_misses
        hit_rate = (
            (self.cache_hits / total_lookups * 100) if total_lookups > 0 else 0
        )

        return {
            "cache_size": len(self.reputation_cache),
            "cache_hits": self.cache_hits,
            "cache_misses": self.cache_misses,
            "hit_rate_percent": hit_rate,
            "vt_api_calls": self.vt_api_calls,
            "abuseipdb_api_calls": self.abuseipdb_api_calls,
            "abuseipdb_calls_remaining": max(
                0, self.abuseipdb_rate_limit - self.abuseipdb_calls_today
            ),
            "cache_ttl_hours": self.cache_ttl.total_seconds() / 3600,
        }

    def clear_cache(self):
        """Clear all cached reputation scores"""
        self.reputation_cache.clear()

    def is_high_risk(self, score: ReputationScore, threshold: float = 50.0) -> bool:
        """Determine if score meets high-risk threshold"""
        return score.combined_risk_score >= threshold
