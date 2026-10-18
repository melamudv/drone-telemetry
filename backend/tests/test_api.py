def get(client, query=""):
    resp = client.get(f"/api/drones?page_size=1000&{query}")
    assert resp.status_code == 200, resp.text
    return resp.json()


def ids(data):
    return sorted({d["drone_id"] for d in data["items"]})


def test_list_all(loaded):
    assert get(loaded)["total"] == 9


def test_filter_type(loaded):
    assert ids(get(loaded, "drone_type=VTOL")) == ["DRONE-003", "DRONE-005"]


def test_filter_multiple_types(loaded):
    result = ids(get(loaded, "drone_type=VTOL&drone_type=Quadcopter"))
    assert "DRONE-001" in result and "DRONE-003" in result
    assert "DRONE-002" not in result  # Fixed Wing


def test_filter_status(loaded):
    assert ids(get(loaded, "status=lost_signal")) == ["DRONE-003"]
    assert "DRONE-005" in ids(get(loaded, "status=active"))  # ' Active ' was normalized


def test_filter_multiple_statuses(loaded):
    result = ids(get(loaded, "status=lost_signal&status=landed"))
    assert "DRONE-003" in result
    assert "DRONE-001" not in result  # active


def test_filter_operator(loaded):
    assert ids(get(loaded, "operator_id=OP-456")) == ["DRONE-002", "DRONE-005"]


def test_filter_min_battery(loaded):
    assert ids(get(loaded, "min_battery=80")) == ["DRONE-004"]


def test_filter_date_range_from_to(loaded):
    # date-only 'to' covers the entire day
    assert ids(get(loaded, "from=2026-06-27&to=2026-06-27")) == ["DRONE-004"]
    assert ids(get(loaded, "from=2026-06-28T10:38:00Z&to=2026-06-28")) == [
        "DRONE-001",
        "DRONE-002",
        "DRONE-003",
    ]


def test_invalid_date_is_422(loaded):
    assert loaded.get("/api/drones?from=yesterday").status_code == 422


def test_combined_filters(loaded):
    assert ids(get(loaded, "drone_type=Quadcopter&status=active&min_battery=70")) == ["DRONE-001"]


def test_latest_only(loaded):
    data = get(loaded, "latest_only=true")
    assert data["total"] == 5
    d1 = next(d for d in data["items"] if d["drone_id"] == "DRONE-001")
    assert d1["timestamp"].startswith("2026-06-28T10:45")


def test_pagination(loaded):
    page = loaded.get("/api/drones?page=2&page_size=4").json()
    assert page["total"] == 9 and len(page["items"]) == 4 and page["page"] == 2
    assert len(loaded.get("/api/drones?page=3&page_size=4").json()["items"]) == 1


def test_page_size_limit(loaded):
    assert loaded.get("/api/drones?page_size=5000").status_code == 422


def test_get_single(loaded):
    first = get(loaded)["items"][0]
    assert loaded.get(f"/api/drones/{first['id']}").json()["drone_id"] == first["drone_id"]
    assert loaded.get("/api/drones/99999").status_code == 404


def test_path_sorted_oldest_first(loaded):
    path = loaded.get("/api/drones/DRONE-001/path").json()
    times = [p["timestamp"] for p in path]
    assert len(path) == 4 and times == sorted(times)
    assert loaded.get("/api/drones/NOPE/path").status_code == 404


def test_drone_types(loaded):
    assert loaded.get("/api/drone-types").json() == ["Fixed Wing", "Quadcopter", "VTOL"]


def test_stats(loaded):
    stats = loaded.get("/api/stats").json()
    assert stats["total_records"] == 9
    assert stats["total_drones"] == 5
    assert stats["by_status"] == {"active": 3, "landed": 1, "lost_signal": 1}
    assert stats["low_battery_drones"] == 2  # DRONE-003 (15) and DRONE-005 (18)
    assert stats["last_run"]["status"] == "completed"


def test_timestamps_serialized_as_utc(loaded):
    first = loaded.get("/api/drones?latest_only=true").json()["items"][0]
    assert first["timestamp"].endswith("Z")
    run = loaded.get("/api/pipeline/runs").json()[0]
    assert run["started_at"].endswith("Z")


def test_empty_database(client):
    assert client.get("/api/drones").json()["total"] == 0
    assert client.get("/api/stats").json()["total_drones"] == 0
