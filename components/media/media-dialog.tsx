"use client";

// Supabase Storage-backed media browser, replacing the old git-shaped
// MediaView. Lists/uploads/deletes objects in the current itinerary's
// `<slug>/` folder via /api/cms/media/[slug]; `onSubmit` receives the
// selected bucket keys (`<slug>/<file>`) — the image field stores these
// directly, and rich-text converts them to display/site paths itself.

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { requireApiSuccess } from "@/lib/api-client";
import { getFileExtension } from "@/lib/utils/file";
import { useItinerarySlug } from "@/components/media/media-upload";
import { cn } from "@/lib/utils";

type MediaItem = {
  slug: string;
  filename: string;
  path: string;
  publicUrl: string;
  size: number | null;
  updatedAt: string | null;
};

export interface MediaDialogHandle {
  open: () => void;
  close: () => void;
}

const MediaDialog = forwardRef(({
  onSubmit,
  maxSelected,
  children,
  extensions,
  onOpenChange,
}: {
  media?: string,
  onSubmit: (images: string[]) => void,
  maxSelected?: number,
  initialPath?: string,
  children?: React.ReactNode,
  extensions?: string[],
  onOpenChange?: (open: boolean) => void
}, ref) => {
  const slug = useItinerarySlug();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    open: () => handleOpenChange(true),
    close: () => handleOpenChange(false),
  }));

  const fetchItems = useCallback(async () => {
    if (!slug) return;
    try {
      const response = await fetch(`/api/cms/media/${encodeURIComponent(slug)}`);
      const data = await requireApiSuccess<any>(response, "Failed to list media");
      setItems(data.data as MediaItem[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to list media");
      setItems([]);
    }
  }, [slug]);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setSelected([]);
      setItems(null);
      fetchItems();
    }
    onOpenChange?.(nextOpen);
  };

  useEffect(() => {
    // Refresh if the route's slug changes while the dialog is mounted open.
    if (open) fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const visibleItems = extensions?.length
    ? (items ?? []).filter((item) => extensions.includes(getFileExtension(item.filename)))
    : (items ?? []);

  const toggleSelected = (path: string) => {
    setSelected((prev) => {
      if (prev.includes(path)) return prev.filter((p) => p !== path);
      if (maxSelected === 1) return [path];
      if (typeof maxSelected === "number" && prev.length >= maxSelected) {
        toast.error(`You can select up to ${maxSelected} image${maxSelected > 1 ? "s" : ""}.`);
        return prev;
      }
      return [...prev, path];
    });
  };

  const handleUploadFiles = async (files: File[]) => {
    if (!slug || files.length === 0) return;
    setIsUploading(true);
    try {
      for (const file of files) {
        const uploadPromise = (async () => {
          const formData = new FormData();
          formData.append("file", file);
          const response = await fetch(`/api/cms/media/${encodeURIComponent(slug)}`, {
            method: "POST",
            body: formData,
          });
          const data = await requireApiSuccess<any>(response, "Failed to upload file");
          return data.data as MediaItem;
        })();

        await toast.promise(uploadPromise, {
          loading: `Uploading ${file.name}`,
          success: (item) => {
            toggleSelected(item.path);
            return `Uploaded ${file.name}`;
          },
          error: (error: unknown) => error instanceof Error ? error.message : "Upload failed",
        });
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsUploading(false);
      fetchItems();
    }
  };

  const handleDelete = async (item: MediaItem) => {
    if (!slug) return;
    const deletePromise = (async () => {
      const response = await fetch(
        `/api/cms/media/${encodeURIComponent(slug)}/${encodeURIComponent(item.filename)}`,
        { method: "DELETE" },
      );
      await requireApiSuccess<any>(response, "Failed to delete file");
    })();

    await toast.promise(deletePromise, {
      loading: `Deleting ${item.filename}`,
      success: () => {
        setSelected((prev) => prev.filter((p) => p !== item.path));
        setItems((prev) => prev?.filter((i) => i.path !== item.path) ?? prev);
        return `Deleted ${item.filename}`;
      },
      error: (error: unknown) => error instanceof Error ? error.message : "Delete failed",
    });
  };

  const handleSubmit = () => {
    onSubmit(selected);
    handleOpenChange(false);
  };

  const accept = extensions?.length
    ? extensions.map((extension) => `.${extension}`).join(",")
    : undefined;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Photos</DialogTitle>
          <DialogDescription>
            {slug
              ? "Pick from this itinerary's photos or upload new ones."
              : "Save the itinerary first — photos are stored per itinerary."}
          </DialogDescription>
        </DialogHeader>

        {slug && (
          items === null ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader className="h-4 w-4 animate-spin" />
            </div>
          ) : visibleItems.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No photos yet. Upload one to get started.
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[50vh] overflow-y-auto pr-1">
              {visibleItems.map((item) => {
                const isSelected = selected.includes(item.path);
                return (
                  <div key={item.path} className="relative group">
                    <button
                      type="button"
                      onClick={() => toggleSelected(item.path)}
                      title={item.filename}
                      className={cn(
                        "block w-full aspect-square overflow-hidden rounded-md bg-muted ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        isSelected && "ring-2 ring-primary ring-offset-2",
                      )}
                    >
                      <img
                        src={item.publicUrl}
                        alt={item.filename}
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="absolute top-1 right-1 hidden group-hover:inline-flex bg-background/95 backdrop-blur-sm text-muted-foreground hover:text-foreground"
                      onClick={() => handleDelete(item)}
                      aria-label={`Delete ${item.filename}`}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                );
              })}
            </div>
          )
        )}

        {slug && (
          <DialogFooter className="gap-2 sm:justify-between">
            <div>
              <input
                type="file"
                ref={fileInputRef}
                accept={accept}
                multiple={maxSelected !== 1}
                hidden
                onChange={(event) => {
                  const files = event.target.files;
                  if (files?.length) handleUploadFiles(Array.from(files));
                  event.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-3.5 w-3.5" />
                Upload
              </Button>
            </div>
            <Button
              type="button"
              size="sm"
              disabled={selected.length === 0}
              onClick={handleSubmit}
            >
              {selected.length > 1 ? `Select ${selected.length}` : "Select"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
});

MediaDialog.displayName = "MediaDialog";

export { MediaDialog };
