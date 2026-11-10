use chrono::{DateTime, Datelike, Days, NaiveDate, Utc};
use chrono_tz::Tz;

pub fn resolve_app_timezone() -> String {
    let selected = std::env::var("CODEX_USAGE_TIMEZONE")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| iana_time_zone::get_timezone().ok())
        .unwrap_or_else(|| "UTC".to_string());
    canonical_app_timezone(&selected)
}

fn parse_timezone(timezone: &str) -> Tz {
    timezone.parse::<Tz>().unwrap_or(chrono_tz::UTC)
}

fn canonical_app_timezone(selected: &str) -> String {
    // Match the zone actually used by date_key_in_timezone, including its UTC
    // fallback. Metadata must not advertise an invalid environment override.
    parse_timezone(selected).name().to_string()
}

pub fn date_key_in_timezone(date: DateTime<Utc>, timezone: &str) -> String {
    let local = date.with_timezone(&parse_timezone(timezone));
    format!(
        "{:04}-{:02}-{:02}",
        local.year(),
        local.month(),
        local.day()
    )
}

pub fn shift_date_key(date_key: &str, delta_days: i64) -> Result<String, String> {
    let date =
        NaiveDate::parse_from_str(date_key, "%Y-%m-%d").map_err(|error| error.to_string())?;
    let shifted = if delta_days >= 0 {
        date.checked_add_days(Days::new(delta_days as u64))
    } else {
        date.checked_sub_days(Days::new(delta_days.unsigned_abs()))
    }
    .ok_or_else(|| "date shift overflow".to_string())?;
    Ok(shifted.format("%Y-%m-%d").to_string())
}

pub fn list_date_keys(start_date: &str, end_date: &str) -> Result<Vec<String>, String> {
    let mut keys = Vec::new();
    let mut current = start_date.to_string();

    while current.as_str() <= end_date {
        keys.push(current.clone());
        current = shift_date_key(&current, 1)?;
    }

    Ok(keys)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shifts_date_keys() {
        assert_eq!(shift_date_key("2026-04-01", -1).unwrap(), "2026-03-31");
        assert_eq!(shift_date_key("2026-04-01", 1).unwrap(), "2026-04-02");
    }

    #[test]
    fn invalid_timezone_metadata_matches_the_utc_grouping_fallback() {
        let instant = "2026-11-10T00:30:00Z".parse::<DateTime<Utc>>().unwrap();
        let zone = canonical_app_timezone("invalid/example");
        assert_eq!(zone, "UTC");
        assert_eq!(date_key_in_timezone(instant, "invalid/example"), "2026-11-10");
        assert_eq!(date_key_in_timezone(instant, &zone), "2026-11-10");
    }

    #[test]
    fn timezone_metadata_preserves_cross_midnight_and_dst_date_grouping() {
        let before_dst = "2026-03-08T04:30:00Z".parse::<DateTime<Utc>>().unwrap();
        let after_dst = "2026-03-08T07:30:00Z".parse::<DateTime<Utc>>().unwrap();
        let zone = canonical_app_timezone("America/New_York");
        assert_eq!(zone, "America/New_York");
        assert_eq!(date_key_in_timezone(before_dst, &zone), "2026-03-07");
        assert_eq!(date_key_in_timezone(after_dst, &zone), "2026-03-08");
        assert_eq!(date_key_in_timezone(before_dst, &canonical_app_timezone("Asia/Tokyo")), "2026-03-08");
    }
}
