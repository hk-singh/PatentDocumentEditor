import unittest

from fastapi.testclient import TestClient

from app.__main__ import app, seed_initial_documents
from app.db import Base, SessionLocal, engine


class DocumentVersioningTest(unittest.TestCase):
    def setUp(self):
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
        with SessionLocal() as db:
            seed_initial_documents(db)
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()

    def test_seeded_document_returns_initial_version(self):
        response = self.client.get("/document/1")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["id"], 1)
        self.assertIn("Claims", data["content"])
        self.assertEqual(data["current_version"]["version_number"], 1)
        self.assertEqual(data["current_version"]["revision"], 1)
        self.assertEqual(len(data["versions"]), 1)

    def test_create_version_from_submitted_content(self):
        response = self.client.post(
            "/document/1/versions", json={"content": "<p>Version 2</p>"}
        )

        self.assertEqual(response.status_code, 200)
        version = response.json()
        self.assertEqual(version["version_number"], 2)
        self.assertEqual(version["content"], "<p>Version 2</p>")
        self.assertEqual(version["revision"], 1)

        document_response = self.client.get(
            f"/document/1?version_id={version['id']}"
        )
        document = document_response.json()
        self.assertEqual(document_response.status_code, 200)
        self.assertEqual(document["content"], "<p>Version 2</p>")
        self.assertEqual(len(document["versions"]), 2)

    def test_save_existing_version_does_not_update_other_versions(self):
        original_document = self.client.get("/document/1").json()
        first_version_id = original_document["current_version"]["id"]
        second_version = self.client.post(
            "/document/1/versions", json={"content": "<p>Version 2</p>"}
        ).json()

        save_response = self.client.put(
            f"/document/1/versions/{first_version_id}",
            json={
                "content": "<p>Updated version 1</p>",
                "base_revision": original_document["current_version"]["revision"],
            },
        )

        self.assertEqual(save_response.status_code, 200)
        self.assertEqual(save_response.json()["revision"], 2)
        first_version_response = self.client.get(
            f"/document/1/versions/{first_version_id}"
        )
        second_version_response = self.client.get(
            f"/document/1/versions/{second_version['id']}"
        )
        self.assertEqual(
            first_version_response.json()["content"], "<p>Updated version 1</p>"
        )
        self.assertEqual(second_version_response.json()["content"], "<p>Version 2</p>")

    def test_stale_save_returns_conflict(self):
        original_document = self.client.get("/document/1").json()
        version_id = original_document["current_version"]["id"]

        first_save = self.client.put(
            f"/document/1/versions/{version_id}",
            json={"content": "<p>First save</p>", "base_revision": 1},
        )
        stale_save = self.client.put(
            f"/document/1/versions/{version_id}",
            json={"content": "<p>Stale save</p>", "base_revision": 1},
        )

        self.assertEqual(first_save.status_code, 200)
        self.assertEqual(stale_save.status_code, 409)
        self.assertEqual(stale_save.json()["detail"]["current_revision"], 2)
        current_version = self.client.get(f"/document/1/versions/{version_id}").json()
        self.assertEqual(current_version["content"], "<p>First save</p>")

    def test_save_sanitizes_html(self):
        original_document = self.client.get("/document/1").json()
        version_id = original_document["current_version"]["id"]

        response = self.client.put(
            f"/document/1/versions/{version_id}",
            json={
                "content": '<p onclick="alert(1)">Safe</p><script>alert(1)</script>',
                "base_revision": 1,
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["content"], "<p>Safe</p>")

    def test_missing_document_returns_404(self):
        response = self.client.get("/document/999")

        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
