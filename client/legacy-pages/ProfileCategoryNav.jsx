import React, { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";

/** Profile-only organisation of existing host listings. Listing creation stays in VaRoom's normal workflow. */
export default function ProfileCategoryNav({ hostId, listings = [], isOwner = false, value = null, activeTab = "listings", onTabChange, onChange, onCategoryListings }) {
  const [categories, setCategories] = useState([]);
  const [memberships, setMemberships] = useState({});
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [draftListingIds, setDraftListingIds] = useState([]);
  const [categoryLimit, setCategoryLimit] = useState(null);
  const client = typeof window !== "undefined" ? window.supabaseClient : null;

  async function refresh() {
    if (!client || !hostId) return;
    const { data: rows, error: categoryError } = await client.from("profile_categories")
      .select("id,host_id,name,sort_order,created_at").eq("host_id", hostId).order("sort_order").order("created_at");
    if (categoryError) { setError("Categories are temporarily unavailable."); return; }
    const ids = (rows || []).map((row) => row.id);
    const { data: links, error: membershipError } = ids.length
      ? await client.from("profile_category_listings").select("category_id,listing_id").in("category_id", ids)
      : { data: [], error: null };
    if (membershipError) { setError("Category listings are temporarily unavailable."); return; }
    const next = {};
    (links || []).forEach((link) => { (next[link.category_id] ||= []).push(link.listing_id); });
    setCategories(rows || []);
    setMemberships(next);
    onCategoryListings?.(next);
    if (isOwner) {
      const { data: limit } = await client.rpc("profile_category_limit");
      if (Number.isInteger(Number(limit))) setCategoryLimit(Number(limit));
    }
    setError("");
  }

  useEffect(() => { refresh(); }, [hostId]);
  const categoryTabs = useMemo(() => categories, [categories]);

  async function createCategory() {
    const clean = name.trim();
    if (!clean || clean.length > 60) { setError("Enter a category name (1–60 characters)."); return; }
    if (!editing && categoryLimit !== null && categories.length >= categoryLimit) { setError(categoryLimit === 5 ? "Premium hosts can create up to 5 categories." : "Your plan allows 1 category."); return; }
    if (!editing && !draftListingIds.length) { setError("Select at least one listing before saving a category."); return; }
    setSaving(true);
    const payload = editing
      ? await client.rpc("rename_profile_category", { p_category_id: editing, p_name: clean })
      : await client.rpc("save_profile_category_with_listings", { p_category_id: null, p_name: clean, p_listing_ids: draftListingIds });
    setSaving(false);
    if (payload.error) { setError(payload.error.code === "23505" ? "That category name already exists." : "Could not save this category."); return; }
    setName(""); setEditing(null); setDraftListingIds([]); await refresh();
  }

  async function removeCategory(category) {
    if (!window.confirm(`Delete “${category.name}”? Its listings will remain on VaRoom.`)) return;
    const { error: deleteError } = await client.rpc("delete_profile_category", { p_category_id: category.id });
    if (deleteError) { setError("Could not delete this category."); return; }
    if (value === category.id) onChange?.(null);
    await refresh();
  }

  async function toggleListing(categoryId, listingId, checked) {
    setSaving(true);
    const nextIds = new Set(memberships[categoryId] || []);
    if (checked) nextIds.add(listingId); else nextIds.delete(listingId);
    if (!nextIds.size) { setSaving(false); setError("A category must contain at least one listing."); return; }
    const result = await client.rpc("save_profile_category_with_listings", { p_category_id: categoryId, p_name: null, p_listing_ids: [...nextIds] });
    setSaving(false);
    if (result.error) { setError("Could not update this listing's category."); return; }
    setMemberships((currentMap) => {
      const next = { ...currentMap, [categoryId]: [...nextIds] };
      onCategoryListings?.(next);
      return next;
    });
  }

  return (
    <>
      <div className="profile-category-row" role="tablist" aria-label="Profile listing categories">
        <button type="button" role="tab" aria-selected={activeTab === "listings" && !value} onClick={() => { onChange?.(null); onTabChange?.("listings"); }}>Spaces</button>
        {categoryTabs.map((category) => (
          <button key={category.id} type="button" role="tab" aria-selected={activeTab === "listings" && value === category.id} onClick={() => { onChange?.(category.id); onTabChange?.("listings"); }}>
            {category.name}<span className="profile-category-count">{listings.filter((listing) => (memberships[category.id] || []).includes(listing.id)).length}</span>
          </button>
        ))}
        <button type="button" role="tab" aria-selected={activeTab === "reviews"} onClick={() => onTabChange?.("reviews")}>Reviews</button>
        {isOwner && <button type="button" className="profile-category-manage" onClick={() => { setError(""); setOpen(true); }}><Plus size={15} /> Manage categories</button>}
      </div>
      <style jsx>{`
        .profile-category-row { display:flex; align-items:center; gap:8px; overflow-x:auto; overscroll-behavior-x:contain; scrollbar-width:none; white-space:nowrap; padding:0 4px; border-bottom:1px solid var(--host-profile-border,#242424); }
        .profile-category-row::-webkit-scrollbar { display:none; }
        .profile-category-row button { flex:0 0 auto; display:inline-flex; align-items:center; gap:7px; border:0; border-bottom:2px solid transparent; padding:13px 10px 11px; background:transparent; color:var(--host-profile-muted,#aaa); font:inherit; font-size:13px; font-weight:600; cursor:pointer; }
        .profile-category-row button[aria-selected="true"] { color:var(--host-profile-text,#fff); border-bottom-color:#e5384f; }
        .profile-category-row .profile-category-manage { margin-left:auto; color:#f0a0ab; }
        .profile-category-count { font-size:11px; opacity:.65; }
        .profile-category-row button:focus-visible { outline:2px solid #e5384f; outline-offset:-2px; }
        .profile-category-error { color:var(--host-profile-error,#ff98a6); font-size:13px; }
      `}</style>
      {open && <div role="dialog" aria-modal="true" aria-labelledby="profile-categories-title" style={{ position:"fixed", inset:0, zIndex:1000, background:"rgba(0,0,0,.55)", display:"grid", placeItems:"center", padding:16 }}>
        <section style={{ width:"min(560px,100%)", maxHeight:"85vh", overflowY:"auto", background:"var(--host-profile-surface,#171717)", color:"var(--host-profile-text,#f5f5f5)", border:"1px solid var(--host-profile-border,#333)", borderRadius:16, padding:20 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}><h2 id="profile-categories-title" style={{ margin:0,fontSize:18 }}>Organise your listings</h2><button type="button" aria-label="Close" onClick={() => setOpen(false)}><X size={19}/></button></div>
          <p style={{ color:"var(--host-profile-muted,#aaa)", fontSize:13 }}>Categories only group listings already created through VaRoom.</p>
          {error && <p role="alert" className="profile-category-error">{error}</p>}
          <form onSubmit={(event) => { event.preventDefault(); createCategory(); }} style={{ display:"flex", gap:8, margin:"16px 0", flexWrap:"wrap" }}>
            <input aria-label="Category name" maxLength={60} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Beach houses" style={{ flex:1,minWidth:0,padding:10,borderRadius:8,border:"1px solid var(--host-profile-border,#444)",background:"var(--host-profile-page,#0d0d0d)",color:"var(--host-profile-text,white)" }}/>
            <button type="submit" disabled={saving || (!editing && categoryLimit !== null && categories.length >= categoryLimit)} style={{ padding:"8px 12px",borderRadius:8,background:"#e5384f",color:"white",border:0 }}>{editing ? "Save" : "Add"}</button>
            {!editing && <div style={{ width:"100%",display:"grid",gap:7,marginTop:4 }}>{listings.map((listing) => <label key={listing.id} style={{ display:"flex",alignItems:"center",gap:9,color:"var(--host-profile-muted,#ddd)",fontSize:13 }}><input type="checkbox" checked={draftListingIds.includes(listing.id)} disabled={saving} onChange={(event) => setDraftListingIds((current) => event.target.checked ? [...new Set([...current, listing.id])] : current.filter((id) => id !== listing.id))}/>{listing.title}</label>)}</div>}
          </form>
          {categories.map((category) => <div key={category.id} style={{ borderTop:"1px solid var(--host-profile-border,#303030)",paddingTop:14,marginTop:14 }}>
            <div style={{ display:"flex",alignItems:"center",gap:8 }}><strong style={{ flex:1 }}>{category.name}</strong><button type="button" aria-label={`Rename ${category.name}`} onClick={() => { setEditing(category.id);setName(category.name); }}><Pencil size={15}/></button><button type="button" aria-label={`Delete ${category.name}`} onClick={() => removeCategory(category)}><Trash2 size={15}/></button></div>
            <div style={{ display:"grid",gap:7,marginTop:10 }}>{listings.map((listing) => <label key={listing.id} style={{ display:"flex",alignItems:"center",gap:9,color:"var(--host-profile-muted,#ddd)",fontSize:13 }}><input type="checkbox" checked={(memberships[category.id] || []).includes(listing.id)} disabled={saving} onChange={(event) => toggleListing(category.id,listing.id,event.target.checked)}/>{listing.title}</label>)}{listings.length === 0 && <span style={{ color:"var(--host-profile-subtle,#888)",fontSize:12 }}>No existing listings available to assign yet.</span>}</div>
          </div>)}
          {!categories.length && <p style={{ color:"var(--host-profile-subtle,#888)",fontSize:13 }}>No categories yet.</p>}
          <div style={{ display:"flex",justifyContent:"flex-end",marginTop:18 }}><button type="button" onClick={() => setOpen(false)} style={{ padding:"9px 14px",borderRadius:8,border:"1px solid var(--host-profile-border,#444)",background:"transparent",color:"var(--host-profile-text,white)" }}><Check size={14} style={{ verticalAlign:"middle",marginRight:6 }}/>Done</button></div>
        </section>
      </div>}
    </>
  );
}
