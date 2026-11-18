import request from "supertest";
import { Types } from "mongoose";
import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { Contractor } from "../src/models/Contractor.js";
import { ContractorPersonnel } from "../src/models/ContractorPersonnel.js";
import { ContractorPersonnelSiteAssignment } from "../src/models/ContractorPersonnelSiteAssignment.js";
import { PpeIssuance } from "../src/models/PpeIssuance.js";
import { PpeStock } from "../src/models/PpeStock.js";
import { Project } from "../src/models/Project.js";
import { Site } from "../src/models/Site.js";
import { signInAsIkoshUser } from "./helpers.js";

let sequence = 0;

async function createSite() {
  sequence += 1;

  const project = await Project.create({
    name: `PPE Project ${sequence}`,
    code: `PPEP${sequence}`,
  });
  const site = await Site.create({
    project: project._id,
    name: `PPE Site ${sequence}`,
    code: `PPES${sequence}`,
    status: "ACTIVE",
  });

  return { project, site };
}

async function createContractorPerson(siteId: Types.ObjectId) {
  sequence += 1;

  const contractor = await Contractor.create({
    name: `PPE Contractor ${sequence}`,
  });
  const person = await ContractorPersonnel.create({
    contractor: contractor._id,
    firstName: "Ada",
    lastName: `Okoro ${sequence}`,
    personnelId: `PPE-CP-${sequence}`,
  });

  await ContractorPersonnelSiteAssignment.create({
    personnel: person._id,
    contractor: contractor._id,
    site: siteId,
  });

  return person;
}

function authHeader(authorization: string) {
  return { Authorization: authorization };
}

async function createItem(authorization: string, overrides = {}) {
  sequence += 1;

  const response = await request(app)
    .post("/api/ppe/items")
    .set(authHeader(authorization))
    .send({
      code: `HELMET-${sequence}`,
      name: `Safety helmet ${sequence}`,
      category: "HEAD_PROTECTION",
      unit: "EACH",
      ...overrides,
    });

  expect(response.status).toBe(201);
  return response.body.item as { id: string; code: string; isActive: boolean };
}

async function createStock(
  authorization: string,
  itemId: string,
  siteId: string,
  quantityOnHand = 10,
  minimumQuantity = 2,
) {
  return request(app)
    .post("/api/ppe/stock")
    .set(authHeader(authorization))
    .send({
      itemId,
      siteId,
      quantityOnHand,
      minimumQuantity,
      reason: "Opening stock count",
    });
}

function issue(authorization: string, body: Record<string, unknown>) {
  return request(app)
    .post("/api/ppe/issuances")
    .set(authHeader(authorization))
    .send(body);
}

async function issueFixture(quantity = 1) {
  const { project, site } = await createSite();
  const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
  const employee = await signInAsIkoshUser({
    ikoshRole: "EMPLOYEE",
    assignedSites: [site._id],
  });
  const item = await createItem(manager.authorization);
  const stock = await createStock(
    manager.authorization,
    item.id,
    String(site._id),
    10,
  );

  expect(stock.status).toBe(201);

  const response = await issue(manager.authorization, {
    itemId: item.id,
    siteId: String(site._id),
    recipient: {
      kind: "EMPLOYEE",
      employeeId: String(employee.user._id),
    },
    quantity,
    conditionAtIssue: "NEW",
  });

  expect(response.status).toBe(201);

  return {
    project,
    site,
    manager,
    employee,
    item,
    issuance: response.body.issuance,
  };
}

describe("PPE catalogue", () => {
  it("lets HSE managers create items and rejects duplicate codes", async () => {
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
    const item = await createItem(manager.authorization);

    const duplicate = await request(app)
      .post("/api/ppe/items")
      .set(authHeader(manager.authorization))
      .send({
        code: item.code,
        name: "Duplicate helmet",
        category: "HEAD_PROTECTION",
        unit: "EACH",
      });

    expect(duplicate.status).toBe(409);
  });

  it("prevents supervisors from managing the catalogue or stock", async () => {
    const supervisor = await signInAsIkoshUser({ ikoshRole: "SUPERVISOR" });

    const response = await request(app)
      .post("/api/ppe/items")
      .set(authHeader(supervisor.authorization))
      .send({
        code: "GLOVE-1",
        name: "Gloves",
        category: "HAND_PROTECTION",
        unit: "PAIR",
      });

    expect(response.status).toBe(403);

    const employee = await signInAsIkoshUser({ ikoshRole: "EMPLOYEE" });
    const list = await request(app)
      .get("/api/ppe/items")
      .set(authHeader(employee.authorization));

    expect(list.status).toBe(403);
  });

  it("deactivates items instead of deleting them and hides them by default", async () => {
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
    const item = await createItem(manager.authorization);

    const updated = await request(app)
      .patch(`/api/ppe/items/${item.id}`)
      .set(authHeader(manager.authorization))
      .send({ isActive: false });

    expect(updated.status).toBe(200);
    expect(updated.body.item.isActive).toBe(false);

    const active = await request(app)
      .get("/api/ppe/items")
      .set(authHeader(manager.authorization));
    expect(
      (active.body.items as { id: string }[]).some(
        (candidate) => candidate.id === item.id,
      ),
    ).toBe(false);

    const all = await request(app)
      .get("/api/ppe/items?includeInactive=true")
      .set(authHeader(manager.authorization));
    expect(
      (all.body.items as { id: string }[]).some(
        (candidate) => candidate.id === item.id,
      ),
    ).toBe(true);
  });
});

describe("PPE stock", () => {
  it("requires a reason on creation and adjustment and records it in the audit trail", async () => {
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
    const { site } = await createSite();
    const item = await createItem(manager.authorization);

    const withoutReason = await request(app)
      .post("/api/ppe/stock")
      .set(authHeader(manager.authorization))
      .send({
        itemId: item.id,
        siteId: String(site._id),
        quantityOnHand: 5,
      });

    expect(withoutReason.status).toBe(400);

    const created = await createStock(
      manager.authorization,
      item.id,
      String(site._id),
      5,
    );
    expect(created.status).toBe(201);

    const noReasonPatch = await request(app)
      .patch(`/api/ppe/stock/${created.body.stock.id}`)
      .set(authHeader(manager.authorization))
      .send({ quantityOnHand: 8 });

    expect(noReasonPatch.status).toBe(400);

    const patched = await request(app)
      .patch(`/api/ppe/stock/${created.body.stock.id}`)
      .set(authHeader(manager.authorization))
      .send({ quantityOnHand: 8, reason: "Cycle count correction" });

    expect(patched.status).toBe(200);
    expect(patched.body.stock.quantityOnHand).toBe(8);

    const audit = await AuditLog.findOne({
      action: "ppe.stock_updated",
      entityId: created.body.stock.id,
    }).lean();

    expect(audit?.after).toMatchObject({
      quantityOnHand: 8,
      reason: "Cycle count correction",
    });
  });

  it("flags low and out-of-stock levels separately", async () => {
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
    const { site } = await createSite();
    const item = await createItem(manager.authorization);

    const created = await createStock(
      manager.authorization,
      item.id,
      String(site._id),
      2,
      5,
    );

    expect(created.body.stock.isLowStock).toBe(true);
    expect(created.body.stock.isOutOfStock).toBe(false);

    const emptied = await request(app)
      .patch(`/api/ppe/stock/${created.body.stock.id}`)
      .set(authHeader(manager.authorization))
      .send({ quantityOnHand: 0, reason: "All units issued out" });

    expect(emptied.body.stock.isOutOfStock).toBe(true);
    expect(emptied.body.stock.isLowStock).toBe(false);
  });

  it("rejects duplicate stock rows for the same site and item", async () => {
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
    const { site } = await createSite();
    const item = await createItem(manager.authorization);
    expect(
      (await createStock(manager.authorization, item.id, String(site._id), 1))
        .status,
    ).toBe(201);

    const duplicate = await createStock(
      manager.authorization,
      item.id,
      String(site._id),
      1,
    );

    expect(duplicate.status).toBe(409);
  });
});

describe("PPE issuances", () => {
  it("issues to an employee and keeps contractor identities separate", async () => {
    const { site, manager, employee, item } = await issueFixture(2);
    const contractorPerson = await createContractorPerson(site._id);

    const employeeIssuance = await PpeIssuance.findOne({
      employee: employee.user._id,
    }).lean();
    expect(employeeIssuance?.kind).toBe("EMPLOYEE");
    expect(employeeIssuance?.contractorPersonnel).toBeNull();

    const contractorResponse = await issue(manager.authorization, {
      itemId: item.id,
      siteId: String(site._id),
      recipient: {
        kind: "CONTRACTOR",
        contractorPersonnelId: String(contractorPerson._id),
      },
      quantity: 1,
      conditionAtIssue: "GOOD",
    });

    expect(contractorResponse.status).toBe(201);
    expect(contractorResponse.body.issuance.recipient).toMatchObject({
      kind: "CONTRACTOR",
      employeeId: null,
      contractorPersonnelId: String(contractorPerson._id),
    });

    const stock = await PpeStock.findOne({ item: item.id }).lean();
    expect(stock?.quantityOnHand).toBe(7);
  });

  it("prevents employees from issuing PPE", async () => {
    const { site, employee, item } = await issueFixture(1);

    const response = await issue(employee.authorization, {
      itemId: item.id,
      siteId: String(site._id),
      recipient: {
        kind: "EMPLOYEE",
        employeeId: String(employee.user._id),
      },
      quantity: 1,
      conditionAtIssue: "NEW",
    });

    expect(response.status).toBe(403);
  });

  it("rejects issuance beyond available stock", async () => {
    const { site, manager, employee, item } = await issueFixture(1);

    const response = await issue(manager.authorization, {
      itemId: item.id,
      siteId: String(site._id),
      recipient: {
        kind: "EMPLOYEE",
        employeeId: String(employee.user._id),
      },
      quantity: 100,
      conditionAtIssue: "NEW",
    });

    expect(response.status).toBe(409);
    expect(await PpeIssuance.countDocuments()).toBe(1);

    const stock = await PpeStock.findOne({
      site: site._id,
      item: item.id,
    }).lean();
    expect(stock?.quantityOnHand).toBe(9);
  });

  it("never oversells stock under concurrent issuance", async () => {
    const { site, manager, employee, item } = await issueFixture(1);

    const stock = await PpeStock.findOne({ site: site._id, item: item.id });
    expect(stock).not.toBeNull();
    if (stock) {
      stock.quantityOnHand = 5;
      await stock.save();
    }

    const body = {
      itemId: item.id,
      siteId: String(site._id),
      recipient: {
        kind: "EMPLOYEE",
        employeeId: String(employee.user._id),
      },
      quantity: 3,
      conditionAtIssue: "NEW",
    };

    const responses = await Promise.all([
      issue(manager.authorization, body),
      issue(manager.authorization, body),
    ]);
    const statuses = responses.map((response) => response.status).sort();

    expect(statuses).toEqual([201, 409]);
    expect(await PpeIssuance.countDocuments()).toBe(2);

    const after = await PpeStock.findOne({
      site: site._id,
      item: item.id,
    }).lean();
    expect(after?.quantityOnHand).toBe(2);
  });

  it("returns serviceable PPE to stock exactly once", async () => {
    const { manager, issuance } = await issueFixture(2);

    const returned = await request(app)
      .patch(`/api/ppe/issuances/${issuance.id}/return`)
      .set(authHeader(manager.authorization))
      .send({ returnCondition: "GOOD", restock: true });

    expect(returned.status).toBe(200);
    expect(returned.body.issuance.status).toBe("RETURNED");
    expect(returned.body.issuance.restocked).toBe(true);

    const stock = await PpeStock.findOne({}).lean();
    expect(stock?.quantityOnHand).toBe(10);

    const again = await request(app)
      .patch(`/api/ppe/issuances/${issuance.id}/return`)
      .set(authHeader(manager.authorization))
      .send({ returnCondition: "GOOD", restock: true });

    expect(again.status).toBe(409);
  });

  it("refuses to restock damaged PPE", async () => {
    const { manager, issuance, item, site } = await issueFixture(1);

    const response = await request(app)
      .patch(`/api/ppe/issuances/${issuance.id}/return`)
      .set(authHeader(manager.authorization))
      .send({ returnCondition: "DAMAGED", restock: true });

    expect(response.status).toBe(400);

    const stock = await PpeStock.findOne({
      site: site._id,
      item: item.id,
    }).lean();
    expect(stock?.quantityOnHand).toBe(9);
  });

  it("replaces an issuance, consuming stock and linking the new record", async () => {
    const { manager, issuance } = await issueFixture(1);

    const response = await request(app)
      .post(`/api/ppe/issuances/${issuance.id}/replace`)
      .set(authHeader(manager.authorization))
      .send({ conditionAtIssue: "NEW" });

    expect(response.status).toBe(201);
    expect(response.body.issuance.replacementFor).toBe(issuance.id);
    expect(response.body.issuance.status).toBe("ISSUED");

    const previous = await PpeIssuance.findById(issuance.id).lean();
    expect(previous?.status).toBe("REPLACED");

    const stock = await PpeStock.findOne({}).lean();
    expect(stock?.quantityOnHand).toBe(8);
  });

  it("rejects replacement when the PPE catalogue item is inactive", async () => {
    const { manager, issuance, item, site } = await issueFixture(1);

    const deactivated = await request(app)
      .patch(`/api/ppe/items/${item.id}`)
      .set(authHeader(manager.authorization))
      .send({ isActive: false });

    expect(deactivated.status).toBe(200);

    const response = await request(app)
      .post(`/api/ppe/issuances/${issuance.id}/replace`)
      .set(authHeader(manager.authorization))
      .send({ conditionAtIssue: "NEW" });

    expect(response.status).toBe(409);
    expect(response.body.message).toContain("inactive");

    const previous = await PpeIssuance.findById(issuance.id).lean();
    expect(previous?.status).toBe("ISSUED");

    const stock = await PpeStock.findOne({
      site: site._id,
      item: item.id,
    }).lean();
    expect(stock?.quantityOnHand).toBe(9);

    expect(await PpeIssuance.countDocuments()).toBe(1);
  });

  it("marks PPE lost without returning it to stock", async () => {
    const { manager, issuance, item, site } = await issueFixture(1);

    const response = await request(app)
      .patch(`/api/ppe/issuances/${issuance.id}/lost`)
      .set(authHeader(manager.authorization))
      .send({ notes: "Dropped overboard" });

    expect(response.status).toBe(200);
    expect(response.body.issuance.status).toBe("LOST");

    const stock = await PpeStock.findOne({
      site: site._id,
      item: item.id,
    }).lean();
    expect(stock?.quantityOnHand).toBe(9);
  });
});

describe("PPE personnel history and historical access", () => {
  it("returns separate history for employees and contractor personnel", async () => {
    const { site, manager, employee, item } = await issueFixture(1);
    const contractorPerson = await createContractorPerson(site._id);

    await issue(manager.authorization, {
      itemId: item.id,
      siteId: String(site._id),
      recipient: {
        kind: "CONTRACTOR",
        contractorPersonnelId: String(contractorPerson._id),
      },
      quantity: 1,
      conditionAtIssue: "NEW",
    });

    const employeeHistory = await request(app)
      .get(`/api/ppe/personnel/employee/${employee.user._id}/history`)
      .set(authHeader(manager.authorization));

    expect(employeeHistory.status).toBe(200);
    expect(employeeHistory.body.records).toHaveLength(1);
    expect(employeeHistory.body.records[0].recipient.employeeId).toBe(
      String(employee.user._id),
    );

    const contractorHistory = await request(app)
      .get(`/api/ppe/personnel/contractor/${contractorPerson._id}/history`)
      .set(authHeader(manager.authorization));

    expect(contractorHistory.status).toBe(200);
    expect(contractorHistory.body.records).toHaveLength(1);
    expect(
      contractorHistory.body.records[0].recipient.contractorPersonnelId,
    ).toBe(String(contractorPerson._id));
  });

  it("checks historical records against the record site, not the person's current site", async () => {
    const { site, manager, issuance, employee } = await issueFixture(1);
    const { site: otherSite } = await createSite();

    const siteViewer = await signInAsIkoshUser({
      ikoshRole: "SUPERVISOR",
      assignedSites: [site._id],
    });
    const otherViewer = await signInAsIkoshUser({
      ikoshRole: "SUPERVISOR",
      assignedSites: [otherSite._id],
    });

    // The employee is reassigned away from the site where the PPE was issued.
    employee.user.assignedSites = [new Types.ObjectId(String(otherSite._id))];
    await employee.user.save();

    const readable = await request(app)
      .get(`/api/ppe/issuances/${issuance.id}`)
      .set(authHeader(siteViewer.authorization));

    expect(readable.status).toBe(200);

    const hidden = await request(app)
      .get(`/api/ppe/issuances/${issuance.id}`)
      .set(authHeader(otherViewer.authorization));

    expect(hidden.status).toBe(404);

    const history = await request(app)
      .get(`/api/ppe/personnel/employee/${employee.user._id}/history`)
      .set(authHeader(siteViewer.authorization));

    expect(history.status).toBe(200);
    expect(history.body.records).toHaveLength(1);
  });
});

describe("PPE deletion protection", () => {
  it("blocks contractor personnel deletion when PPE history exists", async () => {
    const { site, manager, item } = await issueFixture(1);
    const contractorPerson = await createContractorPerson(site._id);

    await PpeIssuance.create({
      project: site.project,
      site: site._id,
      item: item.id,
      kind: "CONTRACTOR",
      contractorPersonnel: contractorPerson._id,
      contractor: contractorPerson.contractor,
      name: "Ada Okoro",
      quantity: 1,
      conditionAtIssue: "NEW",
      status: "ISSUED",
      issuedOn: new Date(),
      issuedBy: manager.user._id,
    });

    const response = await request(app)
      .delete(`/api/contractor-personnel/${contractorPerson._id}`)
      .set(authHeader(manager.authorization));

    expect(response.status).toBe(409);
  });

  it("blocks site deletion while PPE stock is held", async () => {
    const manager = await signInAsIkoshUser({ ikoshRole: "HSE_MANAGER" });
    const { project, site } = await createSite();
    const item = await createItem(manager.authorization);

    await createStock(manager.authorization, item.id, String(site._id), 1);

    const response = await request(app)
      .delete(`/api/sites/${site._id}`)
      .set(authHeader(manager.authorization));

    expect(response.status).toBe(409);

    const projectResponse = await request(app)
      .delete(`/api/projects/${project._id}`)
      .set(authHeader(manager.authorization));

    expect(projectResponse.status).toBe(409);
  });
});
