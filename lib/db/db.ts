import { MongoClient, Collection, GridFSBucket } from "mongodb";
import { get } from "../config.ts";
import * as MongoTypes from "./types.ts";
import GET_FILE_DIALOG from "../../seed/get-file-dialog.jsx" with { type: "text" };
import DEVICE_PAGE_TR098 from "../../seed/device-page-tr098.jsx" with { type: "text" };
import DEVICE_PAGE_TR181 from "../../seed/device-page-tr181.jsx" with { type: "text" };

export let filesBucket: GridFSBucket;
export let uploadsBucket: GridFSBucket;

export const collections = {
  devices: null as unknown as Collection<MongoTypes.Device>,
  presets: null as unknown as Collection<MongoTypes.Preset>,
  objects: null as unknown as Collection<MongoTypes.Object>,
  provisions: null as unknown as Collection<MongoTypes.Provision>,
  virtualParameters: null as unknown as Collection<MongoTypes.VirtualParameter>,
  faults: null as unknown as Collection<MongoTypes.Fault>,
  tasks: null as unknown as Collection<MongoTypes.Task>,
  files: null as unknown as Collection<MongoTypes.File>,
  operations: null as unknown as Collection<MongoTypes.Operation>,
  permissions: null as unknown as Collection<MongoTypes.Permission>,
  users: null as unknown as Collection<MongoTypes.User>,
  config: null as unknown as Collection<MongoTypes.Config>,
  cache: null as unknown as Collection<MongoTypes.Cache>,
  locks: null as unknown as Collection<MongoTypes.Lock>,
  views: null as unknown as Collection<MongoTypes.View>,
  uploads: null as unknown as Collection<MongoTypes.Upload>,
};

let clientPromise: Promise<MongoClient>;

export async function connect(): Promise<void> {
  clientPromise = MongoClient.connect("" + get("MONGODB_CONNECTION_URL"));

  const client = await clientPromise;
  const db = client.db();

  collections.tasks = db.collection("tasks");
  collections.devices = db.collection("devices");
  collections.presets = db.collection("presets");
  collections.objects = db.collection("objects");
  collections.files = db.collection("fs.files");
  collections.provisions = db.collection("provisions");
  collections.virtualParameters = db.collection("virtualParameters");
  collections.faults = db.collection("faults");
  collections.operations = db.collection("operations");
  collections.permissions = db.collection("permissions");
  collections.users = db.collection("users");
  collections.config = db.collection("config");
  collections.cache = db.collection("cache");
  collections.locks = db.collection("locks");
  collections.views = db.collection("views");
  collections.uploads = db.collection("uploads.files");
  filesBucket = new GridFSBucket(db);
  uploadsBucket = new GridFSBucket(db, { bucketName: "uploads" });

  await Promise.all([
    collections.tasks.createIndex({ device: 1, timestamp: 1 }),
    collections.cache.createIndex({ expire: 1 }, { expireAfterSeconds: 0 }),
    collections.locks.createIndex({ expire: 1 }, { expireAfterSeconds: 0 }),
  ]);

  // Migrate views: update seed views if they exist in DB
  await migrateViews();
}

async function migrateViews(): Promise<void> {
  const seedViews = [
    { _id: "get-file-dialog", script: GET_FILE_DIALOG },
    { _id: "device-page-tr098", script: DEVICE_PAGE_TR098 },
    { _id: "device-page-tr181", script: DEVICE_PAGE_TR181 },
  ];

  for (const view of seedViews) {
    const existing = await collections.views.findOne({ _id: view._id });
    if (existing) {
      // Update existing view with new script
      await collections.views.updateOne(
        { _id: view._id },
        { $set: { script: view.script } },
      );
    } else {
      // Insert new view
      await collections.views.insertOne(view as MongoTypes.View);
    }
  }
}

export async function disconnect(): Promise<void> {
  if (clientPromise != null) await (await clientPromise).close();
}
