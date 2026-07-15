"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

type ItinerarySummary = {
  slug: string;
  title: string;
  category: string;
  tag: string | null;
  published: boolean;
  updatedAt: string;
};

export default function ItinerariesListPage() {
  const [items, setItems] = useState<ItinerarySummary[] | null>(null);

  const load = async () => {
    const response = await fetch("/api/cms/itineraries");
    const json = await response.json();
    if (json.status !== "success") {
      toast.error(json.message || "Could not load itineraries.");
      return;
    }
    setItems(json.data);
  };

  useEffect(() => {
    load();
  }, []);

  const handleDelete = async (slug: string) => {
    if (!confirm(`Delete "${slug}"? This cannot be undone.`)) return;
    const response = await fetch(`/api/cms/itineraries/${slug}`, { method: "DELETE" });
    const json = await response.json();
    if (json.status !== "success") {
      toast.error(json.message || "Could not delete itinerary.");
      return;
    }
    toast.success("Itinerary deleted.");
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-medium tracking-tight">Itineraries</h1>
        <Link href="/cms/itineraries/new">
          <Button>New itinerary</Button>
        </Link>
      </div>

      {items === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No itineraries yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Tag</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.slug}>
                <TableCell>
                  <Link href={`/cms/itineraries/${item.slug}`} className="hover:underline">
                    {item.title}
                  </Link>
                </TableCell>
                <TableCell className="capitalize">{item.category}</TableCell>
                <TableCell>{item.tag || "—"}</TableCell>
                <TableCell>
                  <Badge variant={item.published ? "default" : "secondary"}>
                    {item.published ? "Published" : "Unpublished"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(item.slug)}>
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
