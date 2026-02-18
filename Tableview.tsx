import { ReactElement, createElement, useState, useCallback, useEffect, useRef } from "react";

import classNames from "classnames";
import { TableviewContainerProps } from "../typings/TableviewProps";
import Big from "big.js";
import "./ui/Tableview.css";

interface CellObject {
    id: string;
    sequenceNumber: string;
    isBlocked: boolean;
    isMerged: boolean;
    mergeId: string;
    isBlank: boolean;

    rowIndex: number;
    columnIndex: number;
    checked: boolean;
    isSelected: boolean;
    rowSpan: number;
    colSpan: number;
    isHidden: boolean;
}

interface TableRow {
    id: string;
    rowIndex: number;
    cells: CellObject[];
}

interface TableData {
    rows: number;
    columns: number;
    tableRows: TableRow[];
    metadata?: {
        createdAt?: string;
        updatedAt?: string;
    };
}

const Tableview = (props: TableviewContainerProps): ReactElement => {
    const getInitialRows = () => {
        if (props.rowCountAttribute?.status === "available" && props.rowCountAttribute.value) {
            return Number(props.rowCountAttribute.value);
        }
        return 3;
    };

    const getInitialColumns = () => {
        if (props.columnCountAttribute?.status === "available" && props.columnCountAttribute.value) {
            return Number(props.columnCountAttribute.value);
        }
        return 3;
    };

    const [rowCount, setRowCount] = useState<number>(getInitialRows());
    const [columnCount, setColumnCount] = useState<number>(getInitialColumns());
    const [tableRows, setTableRows] = useState<TableRow[]>([]);
    const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
    const [isSelectionMode, setIsSelectionMode] = useState<boolean>(false);

    // Drag selection
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const [dragStartCell, setDragStartCell] = useState<{ row: number; col: number } | null>(null);
    const dragSelectionRef = useRef<Set<string>>(new Set());
    const preSelectionRef = useRef<Set<string>>(new Set());

    const [isInitialLoad, setIsInitialLoad] = useState<boolean>(true);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [dataLoaded, setDataLoaded] = useState<boolean>(false);
    const lastSavedDataRef = useRef<string>("");
    const isUserInputRef = useRef<boolean>(false);
    const ignoreAttributeUpdateRef = useRef<boolean>(false);

    // ── Feature flags ─────────────────────────────────────────────────────────
    // Selection (drag) is only allowed when at least one interactive feature is enabled
    const hasBlankingEnabled = !!(props as any).enableCellBlanking;
    const hasMergingEnabled = !!props.enableCellMerging;
    // Selection/drag is meaningful only when merging or blanking is on
    const isSelectionAllowed = hasMergingEnabled || hasBlankingEnabled;

    // ── Statistics ────────────────────────────────────────────────────────────
    const updateCellStatistics = useCallback(
        (rows: TableRow[]) => {
            const totalCells = rows.reduce((sum, row) => sum + row.cells.length, 0);
            // isBlocked is now driven purely by checkbox state (checked === true)
            const blockedCells = rows.reduce((sum, row) => sum + row.cells.filter(c => c.isBlocked).length, 0);
            const mergedCells = rows.reduce((sum, row) => sum + row.cells.filter(c => c.isMerged && !c.isHidden).length, 0);
            const blankCells = rows.reduce((sum, row) => sum + row.cells.filter(c => c.isBlank && !c.isHidden).length, 0);

            if (props.totalCellsAttribute?.status === "available") props.totalCellsAttribute.setValue(new Big(totalCells));
            if (props.blockedCellsAttribute?.status === "available") props.blockedCellsAttribute.setValue(new Big(blockedCells));
            if (props.mergedCellsAttribute?.status === "available") props.mergedCellsAttribute.setValue(new Big(mergedCells));
            if ((props as any).blankCellsAttribute?.status === "available") (props as any).blankCellsAttribute.setValue(new Big(blankCells));
        },
        [props.totalCellsAttribute, props.blockedCellsAttribute, props.mergedCellsAttribute]
    );

    // ── Load data ─────────────────────────────────────────────────────────────
    useEffect(() => {
        if (isSaving) return;
        const incomingData = props.useAttributeData?.value || "";
        if (incomingData === lastSavedDataRef.current && lastSavedDataRef.current !== "") return;

        if (incomingData && incomingData !== "") {
            try {
                const tableData: TableData = JSON.parse(incomingData);
                if (tableData.tableRows && tableData.rows > 0 && tableData.columns > 0) {
                    const validatedRows = tableData.tableRows.map((row, idx) => {
                        const rowIndex = idx + 1;
                        return {
                            ...row,
                            id: `row_${rowIndex}`,
                            rowIndex,
                            cells: row.cells.map((cell, cIdx) => {
                                const colIndex = cIdx + 1;
                                const seqNum = cell.sequenceNumber || "-";
                                // CHANGE: isBlocked is driven only by checkbox (checked), not by cell value
                                const checkedState = cell.checked || false;
                                const validatedCell: CellObject = {
                                    id: `cell_${rowIndex}_${colIndex}`,
                                    sequenceNumber: seqNum,
                                    isBlocked: cell.isBlocked !== undefined ? cell.isBlocked : checkedState,
                                    isMerged: cell.isMerged || false,
                                    mergeId: cell.mergeId || "",
                                    isBlank: cell.isBlank || false,
                                    rowIndex,
                                    columnIndex: colIndex,
                                    checked: checkedState,
                                    isSelected: false,
                                    rowSpan: cell.rowSpan || 1,
                                    colSpan: cell.colSpan || 1,
                                    isHidden: cell.isHidden || false
                                };
                                return validatedCell;
                            })
                        };
                    });

                    setRowCount(tableData.rows);
                    setColumnCount(tableData.columns);
                    ignoreAttributeUpdateRef.current = true;
                    if (props.rowCountAttribute?.status === "available") props.rowCountAttribute.setValue(new Big(tableData.rows));
                    if (props.columnCountAttribute?.status === "available") props.columnCountAttribute.setValue(new Big(tableData.columns));

                    setTableRows(validatedRows);
                    setSelectedCells(new Set());
                    setIsSelectionMode(false);
                    setDataLoaded(true);
                    updateCellStatistics(validatedRows);
                    lastSavedDataRef.current = incomingData;
                    if (isInitialLoad) setTimeout(() => setIsInitialLoad(false), 500);
                }
            } catch (error) {
                console.error("Error loading table from attribute:", error);
                if (isInitialLoad) setTimeout(() => setIsInitialLoad(false), 500);
            }
        } else {
            if (isInitialLoad) setTimeout(() => setIsInitialLoad(false), 500);
        }
    }, [props.useAttributeData?.value, updateCellStatistics, isSaving, isInitialLoad, props.rowCountAttribute, props.columnCountAttribute]);

    useEffect(() => {
        if (ignoreAttributeUpdateRef.current) { ignoreAttributeUpdateRef.current = false; return; }
        if (props.rowCountAttribute?.status === "available" && props.rowCountAttribute.value != null) {
            const v = Number(props.rowCountAttribute.value);
            if (!isNaN(v) && v > 0 && v <= 100 && v !== rowCount && !isUserInputRef.current) setRowCount(v);
        }
    }, [props.rowCountAttribute?.value, rowCount]);

    useEffect(() => {
        if (ignoreAttributeUpdateRef.current) { ignoreAttributeUpdateRef.current = false; return; }
        if (props.columnCountAttribute?.status === "available" && props.columnCountAttribute.value != null) {
            const v = Number(props.columnCountAttribute.value);
            if (!isNaN(v) && v > 0 && v <= 100 && v !== columnCount && !isUserInputRef.current) setColumnCount(v);
        }
    }, [props.columnCountAttribute?.value, columnCount]);

    const createMergeId = (r1: number, c1: number, r2: number, c2: number) => `${r1}${c1}${r2}${c2}`;

    // ── Create table ──────────────────────────────────────────────────────────
    const createNewTable = useCallback((rows: number, cols: number) => {
        if (rows <= 0 || cols <= 0) return;
        const newTableRows: TableRow[] = Array.from({ length: rows }, (_, idx) => {
            const rowIndex = idx + 1;
            return {
                id: `row_${rowIndex}`,
                rowIndex,
                cells: Array.from({ length: cols }, (_, cIdx) => {
                    const colIndex = cIdx + 1;
                    return {
                        id: `cell_${rowIndex}_${colIndex}`,
                        sequenceNumber: "-",
                        isBlocked: false,
                        isMerged: false,
                        mergeId: "",
                        isBlank: false,
                        rowIndex,
                        columnIndex: colIndex,
                        checked: false,
                        isSelected: false,
                        rowSpan: 1,
                        colSpan: 1,
                        isHidden: false
                    };
                })
            };
        });
        setTableRows(newTableRows);
        setSelectedCells(new Set());
        setIsSelectionMode(false);
        setDataLoaded(true);
        saveToBackend(newTableRows, rows, cols);
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (!dataLoaded && tableRows.length === 0) createNewTable(rowCount, columnCount);
        }, 100);
        return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dataLoaded]);

    // ── Save ──────────────────────────────────────────────────────────────────
    const saveToBackend = useCallback(
        (rows: TableRow[], rowCnt: number, colCnt: number) => {
            setIsSaving(true);
            const tableData: TableData = { rows: rowCnt, columns: colCnt, tableRows: rows, metadata: { updatedAt: new Date().toISOString() } };
            const jsonData = JSON.stringify(tableData);
            lastSavedDataRef.current = jsonData;
            if (props.useAttributeData?.status === "available") props.useAttributeData.setValue(jsonData);
            if (props.tableDataAttribute?.status === "available") props.tableDataAttribute.setValue(jsonData);
            ignoreAttributeUpdateRef.current = true;
            if (props.rowCountAttribute?.status === "available") props.rowCountAttribute.setValue(new Big(rowCnt));
            if (props.columnCountAttribute?.status === "available") props.columnCountAttribute.setValue(new Big(colCnt));
            updateCellStatistics(rows);
            if (props.onTableChange?.canExecute) props.onTableChange.execute();
            setTimeout(() => setIsSaving(false), 100);
        },
        [props.useAttributeData, props.tableDataAttribute, props.rowCountAttribute, props.columnCountAttribute, props.onTableChange, updateCellStatistics]
    );

    useEffect(() => {
        if (props.autoSave && tableRows.length > 0 && !isSaving) saveToBackend(tableRows, rowCount, columnCount);
    }, [tableRows, props.autoSave, saveToBackend, isSaving, rowCount, columnCount]);

    useEffect(() => {
        if (tableRows.length > 0) updateCellStatistics(tableRows);
    }, [tableRows, updateCellStatistics]);

    // ── Dimensions ────────────────────────────────────────────────────────────
    const applyDimensions = useCallback(() => {
        if (isNaN(rowCount) || isNaN(columnCount)) { alert("Please enter valid numbers"); return; }
        if (rowCount <= 0 || columnCount <= 0) { alert("Rows and columns must be positive numbers"); return; }
        if (rowCount > 100 || columnCount > 100) { alert("Maximum 100 rows and 100 columns"); return; }
        ignoreAttributeUpdateRef.current = true;
        if (props.rowCountAttribute?.status === "available") props.rowCountAttribute.setValue(new Big(rowCount));
        if (props.columnCountAttribute?.status === "available") props.columnCountAttribute.setValue(new Big(columnCount));
        createNewTable(rowCount, columnCount);
    }, [rowCount, columnCount, createNewTable, props.rowCountAttribute, props.columnCountAttribute]);

    // ── Add row ───────────────────────────────────────────────────────────────
    const addRow = useCallback(() => {
        const newRowCount = rowCount + 1;
        if (newRowCount > 100) { alert("Maximum 100 rows"); return; }
        isUserInputRef.current = true;
        setRowCount(newRowCount);
        ignoreAttributeUpdateRef.current = true;
        if (props.rowCountAttribute?.status === "available") props.rowCountAttribute.setValue(new Big(newRowCount));
        setTableRows(prevRows => {
            const newRows = [...prevRows];
            const rowIndex = newRowCount;
            newRows.push({
                id: `row_${rowIndex}`,
                rowIndex,
                cells: Array.from({ length: columnCount }, (_, cIdx) => {
                    const colIndex = cIdx + 1;
                    return { id: `cell_${rowIndex}_${colIndex}`, sequenceNumber: "-", isBlocked: false, isMerged: false, mergeId: "", isBlank: false, rowIndex, columnIndex: colIndex, checked: false, isSelected: false, rowSpan: 1, colSpan: 1, isHidden: false };
                })
            });
            saveToBackend(newRows, newRowCount, columnCount);
            return newRows;
        });
        setTimeout(() => { isUserInputRef.current = false; }, 100);
    }, [rowCount, columnCount, props.rowCountAttribute, saveToBackend]);

    // ── Add column ────────────────────────────────────────────────────────────
    const addColumn = useCallback(() => {
        const newColCount = columnCount + 1;
        if (newColCount > 100) { alert("Maximum 100 columns"); return; }
        isUserInputRef.current = true;
        setColumnCount(newColCount);
        ignoreAttributeUpdateRef.current = true;
        if (props.columnCountAttribute?.status === "available") props.columnCountAttribute.setValue(new Big(newColCount));
        setTableRows(prevRows => {
            const newRows = prevRows.map(row => ({
                ...row,
                cells: [...row.cells, { id: `cell_${row.rowIndex}_${newColCount}`, sequenceNumber: "-", isBlocked: false, isMerged: false, mergeId: "", isBlank: false, rowIndex: row.rowIndex, columnIndex: newColCount, checked: false, isSelected: false, rowSpan: 1, colSpan: 1, isHidden: false }]
            }));
            saveToBackend(newRows, rowCount, newColCount);
            return newRows;
        });
        setTimeout(() => { isUserInputRef.current = false; }, 100);
    }, [rowCount, columnCount, props.columnCountAttribute, saveToBackend]);

    // ── Cell value change ─────────────────────────────────────────────────────
    const handleCellValueChange = useCallback(
        (rowIndex: number, colIndex: number, newValue: string) => {
            setTableRows(prevRows => {
                const newRows = prevRows.map(row => ({ ...row, cells: row.cells.map(cell => ({ ...cell })) }));
                const targetCell = newRows.find(r => r.rowIndex === rowIndex)?.cells.find(c => c.columnIndex === colIndex);
                if (!targetCell) return prevRows;
                targetCell.sequenceNumber = newValue;
                // CHANGE: isBlocked is NOT updated when cell value changes — only checkbox drives isBlocked
                if (targetCell.mergeId && targetCell.mergeId !== "") {
                    const mergeId = targetCell.mergeId;
                    newRows.forEach(row => row.cells.forEach(cell => {
                        if (cell.mergeId === mergeId) {
                            cell.sequenceNumber = newValue;
                            // isBlocked intentionally NOT changed here
                        }
                    }));
                }
                updateCellStatistics(newRows);
                if (props.autoSave) saveToBackend(newRows, rowCount, columnCount);
                return newRows;
            });
            if (props.onCellClick?.canExecute) props.onCellClick.execute();
        },
        [props.onCellClick, props.autoSave, updateCellStatistics, saveToBackend, rowCount, columnCount]
    );

    // ── Checkbox ──────────────────────────────────────────────────────────────
    const handleCheckboxChange = useCallback(
        (rowIndex: number, colIndex: number) => {
            setTableRows(prevRows => {
                const newRows = prevRows.map(row => ({ ...row, cells: row.cells.map(cell => ({ ...cell })) }));
                const targetCell = newRows.find(r => r.rowIndex === rowIndex)?.cells.find(c => c.columnIndex === colIndex);
                if (!targetCell) return prevRows;
                const newChecked = !targetCell.checked;
                targetCell.checked = newChecked;
                // CHANGE: isBlocked is now driven by checkbox state (checked)
                targetCell.isBlocked = newChecked;
                targetCell.isSelected = newChecked;
                if (targetCell.mergeId && targetCell.mergeId !== "") {
                    const mergeId = targetCell.mergeId;
                    newRows.forEach(row => row.cells.forEach(cell => {
                        if (cell.mergeId === mergeId) {
                            cell.checked = newChecked;
                            cell.isBlocked = newChecked;
                            cell.isSelected = newChecked;
                        }
                    }));
                }
                updateCellStatistics(newRows);
                if (props.autoSave) saveToBackend(newRows, rowCount, columnCount);
                return newRows;
            });
            if (props.onCellClick?.canExecute) props.onCellClick.execute();
        },
        [props.onCellClick, props.autoSave, updateCellStatistics, saveToBackend, rowCount, columnCount]
    );

    // ── Rectangular selection ─────────────────────────────────────────────────
    const getRectangularSelection = useCallback(
        (startRow: number, startCol: number, endRow: number, endCol: number): Set<string> => {
            const minRow = Math.min(startRow, endRow);
            const maxRow = Math.max(startRow, endRow);
            const minCol = Math.min(startCol, endCol);
            const maxCol = Math.max(startCol, endCol);
            const selection = new Set<string>();
            for (let r = minRow; r <= maxRow; r++)
                for (let c = minCol; c <= maxCol; c++)
                    selection.add(`cell_${r}_${c}`);
            return selection;
        },
        []
    );

    // ── Drag select — only active when selection is allowed ───────────────────
    const handleCellMouseDown = useCallback(
        (rowIndex: number, colIndex: number, event: React.MouseEvent) => {
            // CHANGE: if neither merging nor blanking is enabled, block all selection
            if (!isSelectionAllowed) return;
            if ((event.target as HTMLElement).tagName === "INPUT") return;
            event.preventDefault();
            preSelectionRef.current = new Set(selectedCells);
            setIsDragging(true);
            setDragStartCell({ row: rowIndex, col: colIndex });
            setIsSelectionMode(true);
            const cellId = `cell_${rowIndex}_${colIndex}`;
            if (event.shiftKey) {
                dragSelectionRef.current = new Set([cellId]);
                setSelectedCells(prev => { const s = new Set(prev); s.add(cellId); return s; });
            } else {
                dragSelectionRef.current = new Set([cellId]);
                setSelectedCells(new Set([cellId]));
            }
        },
        [selectedCells, isSelectionAllowed]
    );

    const handleCellMouseEnter = useCallback(
        (rowIndex: number, colIndex: number) => {
            if (!isDragging || !dragStartCell) return;
            const dragged = getRectangularSelection(dragStartCell.row, dragStartCell.col, rowIndex, colIndex);
            dragSelectionRef.current = dragged;
            const final = new Set(preSelectionRef.current);
            dragged.forEach(c => final.add(c));
            setSelectedCells(final);
        },
        [isDragging, dragStartCell, getRectangularSelection]
    );

    useEffect(() => {
        const onUp = () => {
            if (isDragging) { setIsDragging(false); setDragStartCell(null); preSelectionRef.current = new Set(); }
        };
        document.addEventListener("mouseup", onUp);
        return () => document.removeEventListener("mouseup", onUp);
    }, [isDragging]);

    const handleCellClick = useCallback(
        (rowIndex: number, colIndex: number, event?: React.MouseEvent) => {
            // CHANGE: if selection is not allowed, skip selection logic entirely
            if (!isSelectionAllowed) {
                if (props.onCellClick?.canExecute) props.onCellClick.execute();
                return;
            }
            if (isDragging) return;
            const cellId = `cell_${rowIndex}_${colIndex}`;
            if (props.onCellClick?.canExecute) props.onCellClick.execute();
            const isCtrlOrCmd = event?.ctrlKey || event?.metaKey;
            if (isSelectionMode) {
                setSelectedCells(prev => {
                    const s = new Set(prev);
                    if (isCtrlOrCmd) {
                        if (s.has(cellId) && s.size > 1) s.delete(cellId); else s.add(cellId);
                    } else {
                        if (s.has(cellId) && s.size === 1) return s;
                        else s.add(cellId);
                    }
                    return s;
                });
            } else {
                setSelectedCells(new Set([cellId]));
                setIsSelectionMode(true);
            }
        },
        [isSelectionMode, isDragging, props.onCellClick, isSelectionAllowed]
    );

    const selectAllCells = useCallback(() => {
        if (!isSelectionAllowed) return;
        const all = new Set<string>();
        tableRows.forEach(row => row.cells.forEach(cell => { if (!cell.isHidden) all.add(cell.id); }));
        setSelectedCells(all);
        setIsSelectionMode(true);
    }, [tableRows, isSelectionAllowed]);

    const clearSelection = useCallback(() => {
        setSelectedCells(new Set());
        setIsSelectionMode(false);
    }, []);

    // ── Merge ─────────────────────────────────────────────────────────────────
    const mergeCells = useCallback(() => {
        if (selectedCells.size < 2) return;
        const positions = Array.from(selectedCells).map(id => {
            const parts = id.replace("cell_", "").split("_");
            return { row: parseInt(parts[0]), col: parseInt(parts[1]) };
        });
        const minRow = Math.min(...positions.map(p => p.row));
        const maxRow = Math.max(...positions.map(p => p.row));
        const minCol = Math.min(...positions.map(p => p.col));
        const maxCol = Math.max(...positions.map(p => p.col));
        if (selectedCells.size !== (maxRow - minRow + 1) * (maxCol - minCol + 1)) {
            alert("Please select a rectangular area to merge"); return;
        }
        setTableRows(prevRows => {
            const newRows = prevRows.map(row => ({ ...row, cells: row.cells.map(cell => ({ ...cell })) }));
            for (let r = minRow; r <= maxRow; r++) {
                for (let c = minCol; c <= maxCol; c++) {
                    const cell = newRows.find(row => row.rowIndex === r)?.cells.find(cl => cl.columnIndex === c);
                    if (cell?.isMerged && cell.mergeId) {
                        const oldId = cell.mergeId;
                        newRows.forEach(row => row.cells.forEach(c2 => {
                            if (c2.mergeId === oldId) { c2.isMerged = false; c2.rowSpan = 1; c2.colSpan = 1; c2.isHidden = false; c2.mergeId = ""; }
                        }));
                    }
                }
            }
            const mergeId = createMergeId(minRow, minCol, maxRow, maxCol);
            const topLeft = newRows.find(r => r.rowIndex === minRow)?.cells.find(c => c.columnIndex === minCol);
            if (!topLeft) return prevRows;
            for (let r = minRow; r <= maxRow; r++) {
                for (let c = minCol; c <= maxCol; c++) {
                    const cell = newRows.find(row => row.rowIndex === r)?.cells.find(cl => cl.columnIndex === c);
                    if (!cell) continue;
                    cell.sequenceNumber = topLeft.sequenceNumber;
                    cell.checked = topLeft.checked;
                    cell.isBlocked = topLeft.isBlocked;
                    cell.isSelected = topLeft.isBlocked;
                    cell.isBlank = topLeft.isBlank;
                    cell.isMerged = true;
                    cell.mergeId = mergeId;
                    if (r === minRow && c === minCol) { cell.rowSpan = maxRow - minRow + 1; cell.colSpan = maxCol - minCol + 1; cell.isHidden = false; }
                    else { cell.rowSpan = 1; cell.colSpan = 1; cell.isHidden = true; }
                }
            }
            updateCellStatistics(newRows);
            saveToBackend(newRows, rowCount, columnCount);
            return newRows;
        });
        const sortedRows = Array.from(selectedCells).map(id => parseInt(id.replace("cell_", "").split("_")[0]));
        const sortedCols = Array.from(selectedCells).map(id => parseInt(id.replace("cell_", "").split("_")[1]));
        setSelectedCells(new Set([`cell_${Math.min(...sortedRows)}_${Math.min(...sortedCols)}`]));
    }, [selectedCells, updateCellStatistics, saveToBackend, rowCount, columnCount]);

    // ── Unmerge ───────────────────────────────────────────────────────────────
    const unmergeCells = useCallback(() => {
        if (selectedCells.size === 0) return;
        const cellId = Array.from(selectedCells)[0];
        const parts = cellId.replace("cell_", "").split("_");
        const rowIndex = parseInt(parts[0]);
        const colIndex = parseInt(parts[1]);
        setTableRows(prevRows => {
            const newRows = prevRows.map(row => ({ ...row, cells: row.cells.map(cell => ({ ...cell })) }));
            const target = newRows.find(r => r.rowIndex === rowIndex)?.cells.find(c => c.columnIndex === colIndex);
            if (!target?.isMerged) return prevRows;
            const mergeId = target.mergeId;
            newRows.forEach(row => row.cells.forEach(cell => {
                if (cell.mergeId === mergeId) { cell.isMerged = false; cell.rowSpan = 1; cell.colSpan = 1; cell.isHidden = false; cell.mergeId = ""; }
            }));
            updateCellStatistics(newRows);
            saveToBackend(newRows, rowCount, columnCount);
            return newRows;
        });
    }, [selectedCells, updateCellStatistics, saveToBackend, rowCount, columnCount]);

    // ── Blank / Unblank ───────────────────────────────────────────────────────
    const blankSelectedCells = useCallback(() => {
        if (selectedCells.size === 0) return;
        setTableRows(prevRows => {
            const newRows = prevRows.map(row => ({ ...row, cells: row.cells.map(cell => ({ ...cell })) }));
            selectedCells.forEach(cellId => {
                const parts = cellId.replace("cell_", "").split("_");
                const rowIndex = parseInt(parts[0]);
                const colIndex = parseInt(parts[1]);
                const cell = newRows.find(r => r.rowIndex === rowIndex)?.cells.find(c => c.columnIndex === colIndex);
                if (!cell || cell.isHidden) return;
                cell.isBlank = true;
                if (cell.mergeId && cell.mergeId !== "") {
                    const mergeId = cell.mergeId;
                    newRows.forEach(row => row.cells.forEach(c => { if (c.mergeId === mergeId) c.isBlank = true; }));
                }
            });
            updateCellStatistics(newRows);
            saveToBackend(newRows, rowCount, columnCount);
            return newRows;
        });
        setSelectedCells(new Set());
        setIsSelectionMode(false);
    }, [selectedCells, updateCellStatistics, saveToBackend, rowCount, columnCount]);

    const unblankSelectedCells = useCallback(() => {
        if (selectedCells.size === 0) return;
        setTableRows(prevRows => {
            const newRows = prevRows.map(row => ({ ...row, cells: row.cells.map(cell => ({ ...cell })) }));
            selectedCells.forEach(cellId => {
                const parts = cellId.replace("cell_", "").split("_");
                const rowIndex = parseInt(parts[0]);
                const colIndex = parseInt(parts[1]);
                const cell = newRows.find(r => r.rowIndex === rowIndex)?.cells.find(c => c.columnIndex === colIndex);
                if (!cell || cell.isHidden) return;
                cell.isBlank = false;
                if (cell.mergeId && cell.mergeId !== "") {
                    const mergeId = cell.mergeId;
                    newRows.forEach(row => row.cells.forEach(c => { if (c.mergeId === mergeId) c.isBlank = false; }));
                }
            });
            updateCellStatistics(newRows);
            saveToBackend(newRows, rowCount, columnCount);
            return newRows;
        });
        setSelectedCells(new Set());
        setIsSelectionMode(false);
    }, [selectedCells, updateCellStatistics, saveToBackend, rowCount, columnCount]);

    // ── Styles ────────────────────────────────────────────────────────────────
    const tableStyle = { borderColor: props.tableBorderColor || "#dee2e6" };
    const selectedCellStyle = { backgroundColor: props.selectedCellColor || "#cfe2ff" };
    const mergedCellStyle = { backgroundColor: props.mergedCellColor || "#e3f2fd", borderColor: "#2196f3" };
    const blankCellStyle = { backgroundColor: (props as any).blankCellColor || "#2c2c2c", borderColor: "#111" };
    const blockedCellStyle = { backgroundColor: "white", borderColor: "#fdd835" };

    // CHANGE: hasSelection only counts cells — "Select All" button also only shows when cells are selected
    const hasSelection = selectedCells.size > 0;

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className={classNames("tableview-container", props.class)} style={props.style}>

            {/* ══ Controls bar ══ */}
            <div className="tableview-controls">

                {/* Generate Table — only rendered when showGenerateButton is true */}
                {props.showGenerateButton && (
                    <button className="tableview-btn tableview-btn-primary" onClick={applyDimensions}>
                        Generate Table
                    </button>
                )}

                {/*
                  * CHANGE: All selection-dependent controls (Select All, Merge, Blank, Clear)
                  * only appear after at least one cell is selected.
                  * Select All is included inside this hasSelection block.
                  */}
                {hasSelection && isSelectionAllowed && (
                    createElement("div", { style: { display: "contents" } },

                        /* Divider — only shown when Generate Table button is also visible */
                        props.showGenerateButton && createElement("div", { className: "tableview-controls-divider" }),

                        /* Selection count badge */
                        createElement("p", { className: "tableview-selection-info" },
                            `${selectedCells.size} cell(s) selected`
                        ),

                        /* ── Select All ── */
                        createElement("button", {
                            className: "tableview-btn tableview-btn-info",
                            onClick: selectAllCells,
                            title: "Select all cells"
                        }, "Select All"),

                        /* ── Merge group ── only when merging is enabled ── */
                        hasMergingEnabled && createElement("div", { style: { display: "contents" } },
                            createElement("button", {
                                className: "tableview-btn tableview-btn-warning",
                                onClick: mergeCells,
                                disabled: selectedCells.size < 2
                            }, "Merge Selected"),
                            createElement("button", {
                                className: "tableview-btn tableview-btn-danger",
                                onClick: unmergeCells
                            }, "Unmerge")
                        ),

                        /* ── Blank group ── only when blanking is enabled ── */
                        hasBlankingEnabled && createElement("div", { style: { display: "contents" } },
                            createElement("button", {
                                className: "tableview-btn tableview-btn-blank",
                                onClick: blankSelectedCells,
                                title: "Hide selected cells visually — data is preserved"
                            }, "Blank"),
                            createElement("button", {
                                className: "tableview-btn tableview-btn-unblank",
                                onClick: unblankSelectedCells,
                                title: "Restore selected blank cells back to normal"
                            }, "Unblank")
                        ),

                        /* ── Clear Selection ── always last ── */
                        createElement("button", {
                            className: "tableview-btn tableview-btn-secondary",
                            onClick: clearSelection
                        }, "Clear Selection")
                    )
                )}

                {/*
                  * CHANGE: The fallback "Select All" shown when no cells are selected
                  * is REMOVED. Select All now only appears after selection has started.
                  * (Old block that showed Select All without a prior selection is gone.)
                  */}
            </div>

            {/* ══ Table ══ */}
            <div className="tableview-table-section">
                {props.showAddColumnButton && (
                    <div className="tableview-add-column-container">
                        <button className="tableview-btn tableview-btn-add" onClick={addColumn} title="Add Column">+</button>
                    </div>
                )}

                <div className="tableview-table-row-wrapper">
                    {props.showAddRowButton && (
                        <div className="tableview-add-row-container">
                            <button className="tableview-btn tableview-btn-add" onClick={addRow} title="Add Row">+</button>
                        </div>
                    )}

                    <div
                        className="tableview-table-wrapper"
                        style={{ userSelect: isDragging ? "none" : "auto" }}
                    >
                        <table
                            className="tableview-table"
                            style={tableStyle}
                            data-rows={rowCount}
                            data-cols={columnCount}
                        >
                            <tbody>
                                {tableRows.map(row => (
                                    <tr key={row.id}>
                                        {row.cells.map(cell => {
                                            if (cell.isHidden) return null;
                                            const isSelected = selectedCells.has(cell.id);

                                            const cellInlineStyle = cell.isBlank
                                                ? blankCellStyle
                                                : isSelected
                                                    ? selectedCellStyle
                                                    : cell.isMerged
                                                        ? mergedCellStyle
                                                        : cell.isBlocked
                                                            ? blockedCellStyle
                                                            : {};

                                            return (
                                                <td
                                                    key={cell.id}
                                                    rowSpan={cell.rowSpan}
                                                    colSpan={cell.colSpan}
                                                    className={classNames("tableview-cell", {
                                                        "tableview-cell-merged": cell.isMerged && !cell.isBlank,
                                                        "tableview-cell-selected": isSelected && !cell.isBlank,
                                                        "tableview-cell-blocked": cell.isBlocked && !cell.isBlank,
                                                        "tableview-cell-blank": cell.isBlank,
                                                        // CHANGE: dragging cursor only applies when selection is allowed
                                                        "tableview-cell-dragging": isDragging && isSelectionAllowed
                                                    })}
                                                    onClick={e => handleCellClick(cell.rowIndex, cell.columnIndex, e)}
                                                    onMouseDown={e => handleCellMouseDown(cell.rowIndex, cell.columnIndex, e)}
                                                    onMouseEnter={() => handleCellMouseEnter(cell.rowIndex, cell.columnIndex)}
                                                    style={cellInlineStyle}
                                                    
                                                >
                                                    {!cell.isBlank && (
                                                        <div className="tableview-cell-content">
                                                            {/*
                                                              * CHANGE: enableCheckbox=false → checkbox is not rendered at all.
                                                              * Previously the checkbox was rendered but non-functional;
                                                              * now it is fully removed from the DOM.
                                                              */}
                                                            {props.enableCheckbox && (
                                                                <input
                                                                    type="checkbox"
                                                                    className="tableview-checkbox"
                                                                    checked={cell.checked}
                                                                    onChange={e => { e.stopPropagation(); handleCheckboxChange(cell.rowIndex, cell.columnIndex); }}
                                                                    onClick={e => e.stopPropagation()}
                                                                />
                                                            )}
                                                            {/*
                                                              * CHANGE: enableCellEditing=false → render a read-only <span>
                                                              * showing the cell's current sequenceNumber value instead of
                                                              * an editable <input>. The value is still fully visible.
                                                              */}
                                                            {props.enableCellEditing ? (
                                                                <input
                                                                    type="text"
                                                                    className="tableview-cell-input"
                                                                    value={cell.sequenceNumber}
                                                                    onChange={e => handleCellValueChange(cell.rowIndex, cell.columnIndex, e.target.value)}
                                                                    onClick={e => e.stopPropagation()}
                                                                    onMouseDown={e => e.stopPropagation()}
                                                                    placeholder="#"
                                                                />
                                                            ) : (
                                                                <span
                                                                    className="tableview-cell-value"
                                                                    title={cell.sequenceNumber}
                                                                >
                                                                    {cell.sequenceNumber}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* ══ Info bar ══ */}
            <div className="tableview-info">
                <p><strong>Table:</strong> {rowCount} rows × {columnCount} columns = {rowCount * columnCount} cells</p>
                <p><strong>Blocked:</strong> {tableRows.reduce((s, row) => s + row.cells.filter(c => c.isBlocked).length, 0)}</p>
                <p><strong>Merged:</strong> {tableRows.reduce((s, row) => s + row.cells.filter(c => c.isMerged && !c.isHidden).length, 0)}</p>
                {hasBlankingEnabled && (
                    <p><strong>Blank:</strong> {tableRows.reduce((s, row) => s + row.cells.filter(c => c.isBlank && !c.isHidden).length, 0)}</p>
                )}
            </div>
        </div>
    );
};

export default Tableview;