import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Key, Download, Upload, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import {
    getKeys,
    downloadEncryptedKeys,
    importKeysWithPassword,
    type ExportedKeys
} from "@/lib/crypto";

interface KeyManagementProps {
    onKeysImported?: () => void;
}

export default function KeyManagement({ onKeysImported }: KeyManagementProps) {
    const [exportPassword, setExportPassword] = useState("");
    const [importPassword, setImportPassword] = useState("");
    const [status, setStatus] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const hasKeys = !!getKeys();

    const handleExport = async () => {
        if (!exportPassword || exportPassword.length < 6) {
            setStatus({ type: "error", message: "Password must be at least 6 characters" });
            return;
        }

        setIsExporting(true);
        setStatus(null);

        try {
            await downloadEncryptedKeys(exportPassword);
            setStatus({ type: "success", message: "Keys exported successfully! Keep the file safe." });
            setExportPassword("");
        } catch (error: any) {
            setStatus({ type: "error", message: error.message || "Failed to export keys" });
        } finally {
            setIsExporting(false);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedFile(file);
            setStatus(null);
        }
    };

    const handleImport = async () => {
        if (!selectedFile) {
            setStatus({ type: "error", message: "Please select a key file first" });
            return;
        }

        if (!importPassword) {
            setStatus({ type: "error", message: "Please enter the password" });
            return;
        }

        setIsImporting(true);
        setStatus(null);

        try {
            const fileContent = await selectedFile.text();
            const exportedKeys: ExportedKeys = JSON.parse(fileContent);

            await importKeysWithPassword(exportedKeys, importPassword);

            // Upload the restored public key to server
            const keys = getKeys();
            if (keys) {
                const res = await fetch("/api/user/public-key", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ publicKey: keys.publicKey }),
                    credentials: "include",
                });

                if (!res.ok) {
                    console.warn("Failed to sync public key with server");
                }
            }

            setStatus({ type: "success", message: "Keys imported successfully! Old messages should now decrypt." });
            setImportPassword("");
            setSelectedFile(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
            onKeysImported?.();
        } catch (error: any) {
            setStatus({ type: "error", message: error.message || "Failed to import keys" });
        } finally {
            setIsImporting(false);
        }
    };

    return (
        <div className="space-y-4">
            <h3 className="text-lg font-medium text-[#C9D1D9] mb-4 flex items-center">
                <Key className="w-5 h-5 mr-2" />
                Encryption Keys
            </h3>

            <p className="text-sm text-gray-400 mb-4">
                Export your encryption keys to use on another device, or import previously exported keys.
                {!hasKeys && (
                    <span className="text-yellow-500 block mt-1">
                        ⚠️ No local keys found. Generate keys or import from backup.
                    </span>
                )}
            </p>

            {/* Status Message */}
            {status && (
                <div className={`flex items-center gap-2 p-3 rounded-lg ${status.type === "success" ? "bg-green-900/20 text-green-400" :
                        status.type === "error" ? "bg-red-900/20 text-red-400" :
                            "bg-blue-900/20 text-blue-400"
                    }`}>
                    {status.type === "success" ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    <span className="text-sm">{status.message}</span>
                </div>
            )}

            {/* Export Section */}
            {hasKeys && (
                <div className="bg-[#161B22] p-4 rounded-lg border border-[#30363D]">
                    <Label className="text-[#C9D1D9] font-medium">Export Keys</Label>
                    <p className="text-xs text-gray-400 mb-3">Encrypt and download your keys for backup or device transfer.</p>
                    <div className="flex gap-2">
                        <Input
                            type="password"
                            placeholder="Enter a strong password"
                            value={exportPassword}
                            onChange={(e) => setExportPassword(e.target.value)}
                            className="bg-[#0D1117] border-[#30363D] text-[#C9D1D9]"
                        />
                        <Button
                            onClick={handleExport}
                            disabled={isExporting || !exportPassword}
                            className="bg-[#238636] hover:bg-[#238636]/90 whitespace-nowrap"
                        >
                            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                            Export
                        </Button>
                    </div>
                </div>
            )}

            {/* Import Section */}
            <div className="bg-[#161B22] p-4 rounded-lg border border-[#30363D]">
                <Label className="text-[#C9D1D9] font-medium">Import Keys</Label>
                <p className="text-xs text-gray-400 mb-3">Restore keys from a previously exported backup file.</p>
                <div className="space-y-2">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json"
                        onChange={handleFileSelect}
                        className="hidden"
                        id="key-file-input"
                    />
                    <Button
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full bg-[#0D1117] border-[#30363D] text-[#C9D1D9] hover:bg-[#30363D]"
                    >
                        <Upload className="w-4 h-4 mr-2" />
                        {selectedFile ? selectedFile.name : "Select Key File"}
                    </Button>
                    {selectedFile && (
                        <div className="flex gap-2">
                            <Input
                                type="password"
                                placeholder="Enter the export password"
                                value={importPassword}
                                onChange={(e) => setImportPassword(e.target.value)}
                                className="bg-[#0D1117] border-[#30363D] text-[#C9D1D9]"
                            />
                            <Button
                                onClick={handleImport}
                                disabled={isImporting || !importPassword}
                                className="bg-[#238636] hover:bg-[#238636]/90 whitespace-nowrap"
                            >
                                {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Import"}
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
