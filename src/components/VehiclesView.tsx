import React, {
  lazy,
  Suspense, useMemo, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  Box,
  Car,
  Check,
  Edit3,
  Eye,
  Plus,
  RotateCcw,
  Search,
  Wrench,
  AlertTriangle,
} from 'lucide-react';
import { useFleet } from '../context/FleetContext';
import {
  Vehicle,
  VehicleBodyType,
  VehicleFuelType,
  VehicleOwnershipType,
  VehicleStatus,
  VehicleTransmission,
} from '../types/fleet';
import {
  formatINR,
  formatKm,
  getDaysUntilExpiry,
  getTodayKolkataDate,
  validateVehicleInput,
  describeDocumentExpiry,
  describeServiceDue,
} from '../lib/calculations';
const Vehicle3DViewer = lazy(() =>
  import('./Vehicle3DViewer').then((m) => ({default: m.Vehicle3DViewer}))
);

const Vehicle3DFallback = () => (
  <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
    Loading 3D viewer…
  </div>
);


type VehicleScreenMode = 'list' | 'add' | 'edit' | 'details' | 'studio3d';

const INITIAL_VEHICLE_FORM: Omit<
  Vehicle,
  'id' | 'ownerId' | 'createdAt' | 'updatedAt'
> = {
  registrationNumber: '',
  make: '',
  model: '',
  variant: '',
  manufacturingYear: 2024,
  colour: 'Arctic White',
  fuelType: 'Petrol+CNG',
  transmission: 'Manual',
  vehicleType: 'Sedan',
  ownershipType: 'Commercial',
  purchaseDate: getTodayKolkataDate(),
  purchasePrice: 850000,
  currentOdometerKm: 0,
  assignedDriverId: '',
  assignedDriverName: '',
  insuranceProvider: '',
  insuranceExpiry: '',
  fcNumber: '',
  fcExpiry: '',
  permitType: 'State Contract Carriage',
  permitNumber: '',
  permitExpiry: '',
  pollutionExpiry: '',
  lastServiceDate: '',
  lastServiceOdometerKm: 0,
  nextServiceDate: '',
  nextServiceOdometerKm: 10000,
  serviceIntervalKm: 10000,
  notes: '',
  status: 'Active',
};

export const VehiclesView: React.FC<{
  onNavigateToLogbook?: (vehicleId: string) => void;
}> = ({ onNavigateToLogbook }) => {
  const {
    user,
    isDemoMode,
    vehicles,
    drivers,
    logbookEntries,
    saveVehicle,
    setVehicleArchiveStatus,
  } = useFleet();

  const [mode, setMode] = useState<VehicleScreenMode>('list');
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL_ACTIVE');
  const [fuelFilter, setFuelFilter] = useState<string>('ALL');

  const [formData, setFormData] = useState(INITIAL_VEHICLE_FORM);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [archiveConfirmVehicle, setArchiveConfirmVehicle] =
    useState<Vehicle | null>(null);

  const filteredVehicles = useMemo(() => {
    return vehicles.filter((v) => {
      if (statusFilter === 'ALL_ACTIVE' && v.status === 'Archived') return false;
      if (
        statusFilter !== 'ALL' &&
        statusFilter !== 'ALL_ACTIVE' &&
        v.status !== statusFilter
      ) {
        return false;
      }
      if (fuelFilter !== 'ALL' && v.fuelType !== fuelFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = `${v.registrationNumber} ${v.make} ${v.model} ${v.variant} ${v.assignedDriverName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [vehicles, statusFilter, fuelFilter, searchQuery]);

  const openAdd = () => {
    setSelectedVehicle(null);
    setFormData(INITIAL_VEHICLE_FORM);
    setFormErrors([]);
    setMode('add');
  };

  const openEdit = (vehicle: Vehicle) => {
    setSelectedVehicle(vehicle);
    setFormData({
      registrationNumber: vehicle.registrationNumber,
      make: vehicle.make,
      model: vehicle.model,
      variant: vehicle.variant,
      manufacturingYear: vehicle.manufacturingYear,
      colour: vehicle.colour,
      fuelType: vehicle.fuelType,
      transmission: vehicle.transmission,
      vehicleType: vehicle.vehicleType,
      ownershipType: vehicle.ownershipType,
      purchaseDate: vehicle.purchaseDate,
      purchasePrice: vehicle.purchasePrice,
      currentOdometerKm: vehicle.currentOdometerKm,
      assignedDriverId: vehicle.assignedDriverId,
      assignedDriverName: vehicle.assignedDriverName,
      insuranceProvider: vehicle.insuranceProvider,
      insuranceExpiry: vehicle.insuranceExpiry,
      fcNumber: vehicle.fcNumber,
      fcExpiry: vehicle.fcExpiry,
      permitType: vehicle.permitType,
      permitNumber: vehicle.permitNumber,
      permitExpiry: vehicle.permitExpiry,
      pollutionExpiry: vehicle.pollutionExpiry,
      lastServiceDate: vehicle.lastServiceDate,
      lastServiceOdometerKm: vehicle.lastServiceOdometerKm,
      nextServiceDate: vehicle.nextServiceDate,
      nextServiceOdometerKm: vehicle.nextServiceOdometerKm,
      serviceIntervalKm: vehicle.serviceIntervalKm,
      notes: vehicle.notes,
      status: vehicle.status,
    });
    setFormErrors([]);
    setMode('edit');
  };

  const openDetails = (vehicle: Vehicle) => {
    setSelectedVehicle(vehicle);
    setMode('details');
  };

  const openStudio3D = (vehicle?: Vehicle) => {
    const target =
      vehicle ||
      selectedVehicle ||
      filteredVehicles[0] ||
      vehicles[0] ||
      null;
    setSelectedVehicle(target);
    setMode('studio3d');
  };

  const handleDriverSelect = (driverId: string) => {
    const drv = drivers.find((d) => d.id === driverId);
    setFormData((prev) => ({
      ...prev,
      assignedDriverId: driverId,
      assignedDriverName: drv ? drv.fullName : '',
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ownerUid = isDemoMode ? 'demo-owner' : user?.uid || '';
    const validation = validateVehicleInput(
      { ...formData, ownerId: ownerUid },
      ownerUid
    );
    if (!validation.valid) {
      setFormErrors(validation.errors);
      return;
    }

    setSaving(true);
    setFormErrors([]);
    try {
      await saveVehicle(
        formData,
        mode === 'edit' && selectedVehicle ? selectedVehicle.id : undefined
      );
      setMode('list');
    } catch (err: any) {
      setFormErrors([err?.message || 'Failed to save vehicle record.']);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmArchiveToggle = async () => {
    if (!archiveConfirmVehicle) return;
    const nextStatus: VehicleStatus =
      archiveConfirmVehicle.status === 'Archived' ? 'Active' : 'Archived';
    await setVehicleArchiveStatus(archiveConfirmVehicle, nextStatus);
    setArchiveConfirmVehicle(null);
    if (selectedVehicle?.id === archiveConfirmVehicle.id) {
      setSelectedVehicle({ ...archiveConfirmVehicle, status: nextStatus });
    }
  };

  if (mode === 'studio3d') {
    const currentVeh =
      (selectedVehicle &&
        vehicles.find((v) => v.id === selectedVehicle.id)) ||
      selectedVehicle ||
      vehicles[0] ||
      null;

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMode('list')}
              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              aria-label="Back to vehicles list"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                3D Fleet Digital Twin &amp; 360° Photo Studio
              </h2>
              <p className="text-sm text-slate-500">
                Interactive Three.js WebGL 12-part vehicle assembly, GLB/glTF model viewer, and 8-angle 360° photo sequence turntable.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label
              htmlFor="studio-vehicle-selector"
              className="text-xs font-semibold text-slate-600"
            >
              Select Vehicle:
            </label>
            <select
              id="studio-vehicle-selector"
              value={currentVeh?.id || ''}
              onChange={(e) => {
                const found = vehicles.find((v) => v.id === e.target.value);
                if (found) setSelectedVehicle(found);
              }}
              className="px-3 py-2 text-sm font-mono font-semibold border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
            >
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.registrationNumber} — {v.make} {v.model} ({v.vehicleType})
                </option>
              ))}
            </select>

            {currentVeh && (
              <button
                type="button"
                onClick={() => openDetails(currentVeh)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Full Vehicle Details
              </button>
            )}
          </div>
        </div>

        {currentVeh ? (
          <Suspense fallback={<Vehicle3DFallback />}>
            <Vehicle3DViewer vehicle={currentVeh} />
          </Suspense>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-3">
            <p className="text-base font-semibold text-slate-900">
              No vehicles registered yet
            </p>
            <p className="text-sm text-slate-500">
              Add a vehicle first to inspect its 3D model, upload multi-angle photographs, or load GLB/glTF assets.
            </p>
            <button
              type="button"
              onClick={openAdd}
              className="px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700"
            >
              Add First Vehicle
            </button>
          </div>
        )}
      </div>
    );
  }

  if (mode === 'add' || mode === 'edit') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMode('list')}
              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              aria-label="Back to vehicles list"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                {mode === 'add'
                  ? 'Add Commercial or Personal Vehicle'
                  : `Edit Vehicle · ${selectedVehicle?.registrationNumber}`}
              </h2>
              <p className="text-sm text-slate-500">
                Complete registration, validated odometer, service intervals, and compliance dates.
              </p>
            </div>
          </div>
        </div>

        {formErrors.length > 0 && (
          <div
            role="alert"
            className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800 space-y-1"
          >
            <p className="font-semibold">Please resolve the following issues:</p>
            <ul className="list-disc list-inside">
              {formErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section 1: Core Identification & Specs */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h3 className="text-base font-semibold text-slate-900 border-b border-slate-100 pb-2">
              01. Identification &amp; Vehicle Specifications
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Registration Number *
                </label>
                <input
                  type="text"
                  required
                  placeholder="TN-38-CZ-4512"
                  value={formData.registrationNumber}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      registrationNumber: e.target.value.toUpperCase(),
                    })
                  }
                  className="w-full px-3 py-2 text-sm font-mono uppercase border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Make *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Maruti Suzuki / Toyota"
                  value={formData.make}
                  onChange={(e) =>
                    setFormData({ ...formData, make: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Model *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Dzire Tour S / Innova Crysta"
                  value={formData.model}
                  onChange={(e) =>
                    setFormData({ ...formData, model: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Variant
                </label>
                <input
                  type="text"
                  placeholder="CNG Commercial / 2.4 GX"
                  value={formData.variant}
                  onChange={(e) =>
                    setFormData({ ...formData, variant: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Manufacturing Year *
                </label>
                <input
                  type="number"
                  required
                  min={1980}
                  max={2100}
                  value={formData.manufacturingYear}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      manufacturingYear: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Colour
                </label>
                <input
                  type="text"
                  value={formData.colour}
                  onChange={(e) =>
                    setFormData({ ...formData, colour: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Fuel Type
                </label>
                <select
                  value={formData.fuelType}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      fuelType: e.target.value as VehicleFuelType,
                    })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                >
                  {[
                    'Petrol+CNG',
                    'Diesel',
                    'Petrol',
                    'CNG',
                    'LPG',
                    'Electric',
                    'Hybrid',
                  ].map((ft) => (
                    <option key={ft} value={ft}>
                      {ft}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Transmission
                </label>
                <select
                  value={formData.transmission}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      transmission: e.target.value as VehicleTransmission,
                    })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                >
                  {['Manual', 'Automatic', 'AMT', 'CVT'].map((tr) => (
                    <option key={tr} value={tr}>
                      {tr}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Vehicle Type
                </label>
                <select
                  value={formData.vehicleType}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      vehicleType: e.target.value as VehicleBodyType,
                    })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                >
                  {[
                    'Sedan',
                    'SUV',
                    'Hatchback',
                    'MPV',
                    'Commercial Van',
                    'Truck',
                  ].map((vt) => (
                    <option key={vt} value={vt}>
                      {vt}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Ownership Type
                </label>
                <select
                  value={formData.ownershipType}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      ownershipType: e.target.value as VehicleOwnershipType,
                    })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                >
                  {['Commercial', 'Personal', 'Leased', 'Attached'].map(
                    (ot) => (
                      <option key={ot} value={ot}>
                        {ot}
                      </option>
                    )
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Purchase Date
                </label>
                <input
                  type="date"
                  value={formData.purchaseDate}
                  onChange={(e) =>
                    setFormData({ ...formData, purchaseDate: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Purchase Price (INR ₹)
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={formData.purchasePrice}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      purchasePrice: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Odometer, Driver & Service Schedule */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h3 className="text-base font-semibold text-slate-900 border-b border-slate-100 pb-2">
              02. Validated Odometer, Assigned Driver &amp; Preventive Maintenance
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Current Validated Odometer (km) *
                </label>
                <input
                  type="number"
                  required
                  min={0}
                  step="0.1"
                  value={formData.currentOdometerKm}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      currentOdometerKm: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Assigned Driver
                </label>
                <select
                  value={formData.assignedDriverId}
                  onChange={(e) => handleDriverSelect(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                >
                  <option value="">— Unassigned —</option>
                  {drivers
                    .filter((d) => d.status !== 'Archived')
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.fullName} ({d.phone || 'No phone'})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Service Interval (km)
                </label>
                <input
                  type="number"
                  min={0}
                  step="500"
                  value={formData.serviceIntervalKm}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      serviceIntervalKm: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Operational Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      status: e.target.value as VehicleStatus,
                    })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                >
                  {['Active', 'Maintenance', 'Inactive', 'Archived'].map(
                    (st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    )
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Last Service Date
                </label>
                <input
                  type="date"
                  value={formData.lastServiceDate}
                  onChange={(e) =>
                    setFormData({ ...formData, lastServiceDate: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Last Service Odometer (km)
                </label>
                <input
                  type="number"
                  min={0}
                  value={formData.lastServiceOdometerKm}
                  onChange={(e) => {
                    const lastKm = Number(e.target.value);
                    setFormData({
                      ...formData,
                      lastServiceOdometerKm: lastKm,
                      nextServiceOdometerKm: lastKm + formData.serviceIntervalKm,
                    });
                  }}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Next Service Date
                </label>
                <input
                  type="date"
                  value={formData.nextServiceDate}
                  onChange={(e) =>
                    setFormData({ ...formData, nextServiceDate: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Next Service Odometer (km)
                </label>
                <input
                  type="number"
                  min={0}
                  value={formData.nextServiceOdometerKm}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      nextServiceOdometerKm: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Statutory Compliance & Expiry */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h3 className="text-base font-semibold text-slate-900 border-b border-slate-100 pb-2">
              03. Statutory Documents &amp; Expiry Dates (FC, Insurance, Permit, PUC)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Insurance Provider
                </label>
                <input
                  type="text"
                  placeholder="New India Assurance / ICICI"
                  value={formData.insuranceProvider}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      insuranceProvider: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Insurance Expiry Date
                </label>
                <input
                  type="date"
                  value={formData.insuranceExpiry}
                  onChange={(e) =>
                    setFormData({ ...formData, insuranceExpiry: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Fitness Certificate (FC) Number
                </label>
                <input
                  type="text"
                  placeholder="FC-TN38-2026-8841"
                  value={formData.fcNumber}
                  onChange={(e) =>
                    setFormData({ ...formData, fcNumber: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  FC Expiry Date
                </label>
                <input
                  type="date"
                  value={formData.fcExpiry}
                  onChange={(e) =>
                    setFormData({ ...formData, fcExpiry: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Permit Type
                </label>
                <input
                  type="text"
                  placeholder="State Contract Carriage / AITP"
                  value={formData.permitType}
                  onChange={(e) =>
                    setFormData({ ...formData, permitType: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Permit Number
                </label>
                <input
                  type="text"
                  placeholder="TN-CC-2024-99812"
                  value={formData.permitNumber}
                  onChange={(e) =>
                    setFormData({ ...formData, permitNumber: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Permit Expiry Date
                </label>
                <input
                  type="date"
                  value={formData.permitExpiry}
                  onChange={(e) =>
                    setFormData({ ...formData, permitExpiry: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Pollution Certificate (PUC) Expiry
                </label>
                <input
                  type="date"
                  value={formData.pollutionExpiry}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      pollutionExpiry: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Operational Notes (Max 1000 chars)
              </label>
              <textarea
                rows={3}
                maxLength={1000}
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                placeholder="CNG hydro-testing details, platform attachment notes, tyre history..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setMode('list')}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-sm font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              {saving
                ? 'Saving Vehicle...'
                : mode === 'add'
                ? 'Save Vehicle Record'
                : 'Update Vehicle Record'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (mode === 'details' && selectedVehicle) {
    const liveSelected =
      vehicles.find((v) => v.id === selectedVehicle.id) || selectedVehicle;
    const vehicleLogs = logbookEntries.filter(
      (e) => e.vehicleId === liveSelected.id
    );
    const totalVehicleKm = vehicleLogs.reduce((s, e) => s + e.kmDay, 0);
    const totalVehicleEarnings = vehicleLogs.reduce(
      (s, e) => s + e.earnings,
      0
    );
    const totalVehicleNet = vehicleLogs.reduce(
      (s, e) => s + e.netBusinessEarnings,
      0
    );
    const kmToNextService =
      liveSelected.nextServiceOdometerKm - liveSelected.currentOdometerKm;

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMode('list')}
              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              aria-label="Back to vehicles list"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold font-mono text-slate-900">
                  {liveSelected.registrationNumber}
                </h2>
                <span className="text-xs font-medium text-slate-500">
                  {liveSelected.status} · {liveSelected.ownershipType}
                </span>
              </div>
              <p className="text-sm text-slate-600">
                {liveSelected.make} {liveSelected.model}{' '}
                {liveSelected.variant} · {liveSelected.manufacturingYear} ·{' '}
                {liveSelected.fuelType} · {liveSelected.transmission}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onNavigateToLogbook && (
              <button
                type="button"
                onClick={() => onNavigateToLogbook(liveSelected.id)}
                className="px-4 py-2 text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors whitespace-nowrap"
              >
                View Vehicle Logbook
              </button>
            )}
            <button
              type="button"
              onClick={() => openEdit(liveSelected)}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit Vehicle
            </button>
            <button
              type="button"
              onClick={() => setArchiveConfirmVehicle(liveSelected)}
              className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              {liveSelected.status === 'Archived' ? (
                <>
                  <RotateCcw className="w-3.5 h-3.5" />
                  Restore
                </>
              ) : (
                <>
                  <Archive className="w-3.5 h-3.5" />
                  Archive
                </>
              )}
            </button>
          </div>
        </div>

        {/* Summary Metrics Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs font-medium text-slate-500">
              Current Validated Odometer
            </p>
            <p className="text-2xl font-bold font-mono text-slate-900 mt-1">
              {formatKm(liveSelected.currentOdometerKm)}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Next service at {formatKm(liveSelected.nextServiceOdometerKm)} (
              {kmToNextService > 0
                ? `${formatKm(kmToNextService)} remaining`
                : 'Service Due'}
              )
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs font-medium text-slate-500">
              Logged Shifts &amp; Distance
            </p>
            <p className="text-2xl font-bold font-mono text-slate-900 mt-1">
              {formatKm(totalVehicleKm)}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Across {vehicleLogs.length} recorded logbook shifts
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs font-medium text-slate-500">
              Cumulative Gross Earnings
            </p>
            <p className="text-2xl font-bold font-mono text-slate-900 mt-1">
              {formatINR(totalVehicleEarnings)}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Assigned Driver: {liveSelected.assignedDriverName || 'Unassigned'}
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs font-medium text-slate-500">
              Net Business Earnings
            </p>
            <p className="text-2xl font-bold font-mono text-teal-700 mt-1">
              {formatINR(totalVehicleNet)}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Purchase Price: {formatINR(liveSelected.purchasePrice)}
            </p>
          </div>
        </div>

        {/* Phase 4: Interactive 3D Vehicle Viewer, 360° Photo Sequence & GLB Asset Studio */}
        <Suspense fallback={<Vehicle3DFallback />}>
          <Vehicle3DViewer vehicle={liveSelected} />
        </Suspense>

        {/* Specification & Compliance Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h3 className="text-base font-semibold text-slate-900 border-b border-slate-100 pb-2">
              Statutory Compliance &amp; Expiry Dates
            </h3>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Insurance Provider</dt>
                <dd className="font-medium text-slate-900 mt-0.5">
                  {liveSelected.insuranceProvider || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Insurance Expiry</dt>
                <dd className="font-mono text-slate-900 mt-0.5">
                  {liveSelected.insuranceExpiry || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">FC Number</dt>
                <dd className="font-mono text-slate-900 mt-0.5">
                  {liveSelected.fcNumber || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">FC Expiry</dt>
                <dd className="font-mono text-slate-900 mt-0.5">
                  {liveSelected.fcExpiry || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Permit Type &amp; No.</dt>
                <dd className="font-medium text-slate-900 mt-0.5">
                  {liveSelected.permitType || '—'}{' '}
                  {liveSelected.permitNumber
                    ? `(${liveSelected.permitNumber})`
                    : ''}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Permit Expiry</dt>
                <dd className="font-mono text-slate-900 mt-0.5">
                  {liveSelected.permitExpiry || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Pollution (PUC) Expiry</dt>
                <dd className="font-mono text-slate-900 mt-0.5">
                  {liveSelected.pollutionExpiry || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Purchase Date</dt>
                <dd className="font-mono text-slate-900 mt-0.5">
                  {liveSelected.purchaseDate || '—'}
                </dd>
              </div>
            </dl>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h3 className="text-base font-semibold text-slate-900 border-b border-slate-100 pb-2">
              Service Schedule &amp; Notes
            </h3>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Last Service Date</dt>
                <dd className="font-mono text-slate-900 mt-0.5">
                  {liveSelected.lastServiceDate || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Last Service Odometer</dt>
                <dd className="font-mono text-slate-900 mt-0.5">
                  {formatKm(liveSelected.lastServiceOdometerKm)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Next Service Date</dt>
                <dd className="font-mono text-slate-900 mt-0.5">
                  {liveSelected.nextServiceDate || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Service Interval</dt>
                <dd className="font-mono text-slate-900 mt-0.5">
                  Every {formatKm(liveSelected.serviceIntervalKm)}
                </dd>
              </div>
            </dl>
            <div className="pt-2 border-t border-slate-100">
              <p className="text-xs text-slate-500 mb-1">Operational Notes</p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">
                {liveSelected.notes || 'No notes recorded for this vehicle.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Fleet Vehicles Register
          </h2>
          <p className="text-sm text-slate-500">
            Manage personal and commercial vehicles, validated odometer readings, 3D digital twins, and statutory compliance.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {vehicles.length > 0 && (
            <button
              type="button"
              onClick={() => openStudio3D()}
              className="px-4 py-2 text-sm font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
            >
              <Box className="w-4 h-4 text-teal-600" />
              3D Vehicle Studio
            </button>
          )}
          <button
            type="button"
            onClick={openAdd}
            className="px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            Add Vehicle
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search registration number, make, model, or assigned driver..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto max-w-full">
            {[
              { id: 'ALL_ACTIVE', label: 'Active Fleet' },
              { id: 'Maintenance', label: 'Maintenance' },
              { id: 'Archived', label: 'Archived' },
              { id: 'ALL', label: 'All' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  statusFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <select
            value={fuelFilter}
            onChange={(e) => setFuelFilter(e.target.value)}
            aria-label="Filter by fuel type"
            className="px-3 py-2 text-xs font-medium border border-slate-300 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-600"
          >
            <option value="ALL">All Fuel Types</option>
            <option value="Petrol+CNG">Petrol+CNG</option>
            <option value="Diesel">Diesel</option>
            <option value="Petrol">Petrol</option>
            <option value="CNG">CNG</option>
            <option value="Electric">Electric</option>
          </select>
        </div>
      </div>

      {/* Vehicles Table / Empty State */}
      {filteredVehicles.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center mx-auto">
            <Car className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-slate-900">
            No vehicles match your current view
          </h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Add your first personal or commercial vehicle to begin tracking validated odometer readings, daily 15-column shift logbooks, 3D digital twins, and compliance expiry dates.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={openAdd}
              className="px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add First Vehicle
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Registration</th>
                  <th className="py-3 px-4">Make &amp; Model</th>
                  <th className="py-3 px-4">Specs</th>
                  <th className="py-3 px-4 text-right">Validated Odometer</th>
                  <th className="py-3 px-4">Assigned Driver</th>
                  <th className="py-3 px-4">Compliance &amp; Service</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filteredVehicles.map((v) => {
                  const insDays = getDaysUntilExpiry(v.insuranceExpiry);
                  const fcDays = getDaysUntilExpiry(v.fcExpiry);
                  const pucDays = getDaysUntilExpiry(v.pollutionExpiry);
                  const minExpiryDays = [insDays, fcDays, pucDays]
                    .filter((d): d is number => d !== null)
                    .sort((a, b) => a - b)[0];
                  const serviceRemainingKm =
                    v.nextServiceOdometerKm - v.currentOdometerKm;

                  return (
                    <tr
                      key={v.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono font-semibold text-slate-900 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openDetails(v)}
                          className="hover:text-teal-700 hover:underline text-left"
                        >
                          {v.registrationNumber}
                        </button>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">
                          {v.make} {v.model}
                        </div>
                        <div className="text-xs text-slate-500">
                          {v.variant || 'Standard'} · {v.manufacturingYear} ·{' '}
                          {v.colour}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                        {v.fuelType} · {v.transmission} · {v.ownershipType}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-medium text-slate-900 whitespace-nowrap">
                        {formatKm(v.currentOdometerKm)}
                      </td>
                      <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                        {v.assignedDriverName || (
                          <span className="text-slate-400">Unassigned</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs whitespace-nowrap">
                        <div className="flex flex-col gap-0.5">
                          {(() => {
                            const badge = describeDocumentExpiry(minExpiryDays);
                            if (badge.kind === 'none') {
                              return (
                                <span className="text-slate-600">
                                  Ins: {v.insuranceExpiry || '—'} · FC:{' '}
                                  {v.fcExpiry || '—'}
                                </span>
                              );
                            }
                            return badge.kind === 'expired' ? (
                              <span className="text-red-700 font-medium flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                {badge.text}
                              </span>
                            ) : (
                              <span className="text-amber-700 font-medium flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                {badge.text}
                              </span>
                            );
                          })()}
                          {(() => {
                            const srv = describeServiceDue(serviceRemainingKm);
                            return (
                              <span
                                className={`font-mono ${
                                  srv.severity === 'overdue'
                                    ? 'text-red-700 font-medium'
                                    : srv.severity === 'soon'
                                      ? 'text-amber-700 font-medium'
                                      : 'text-slate-500'
                                }`}
                              >
                                <Wrench className="w-3 h-3 inline mr-1" />
                                {srv.text}
                              </span>
                            );
                          })()}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs font-medium whitespace-nowrap">
                        <span
                          className={
                            v.status === 'Active'
                              ? 'text-emerald-700'
                              : v.status === 'Maintenance'
                              ? 'text-amber-700'
                              : 'text-slate-500'
                          }
                        >
                          {v.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openStudio3D(v)}
                            className="p-1.5 text-teal-600 hover:text-teal-800 hover:bg-teal-50 rounded-md transition-colors"
                            title="Open 3D Vehicle Viewer & 360° Studio"
                          >
                            <Box className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openDetails(v)}
                            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                            title="View Vehicle Details & 3D Twin"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEdit(v)}
                            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                            title="Edit Vehicle"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setArchiveConfirmVehicle(v)}
                            className="p-1.5 text-slate-600 hover:text-amber-700 hover:bg-amber-50 rounded-md transition-colors"
                            title={
                              v.status === 'Archived'
                                ? 'Restore Vehicle'
                                : 'Archive Vehicle'
                            }
                          >
                            {v.status === 'Archived' ? (
                              <RotateCcw className="w-4 h-4" />
                            ) : (
                              <Archive className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Archive / Restore Confirmation Modal */}
      {archiveConfirmVehicle && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">
              {archiveConfirmVehicle.status === 'Archived'
                ? `Restore ${archiveConfirmVehicle.registrationNumber}?`
                : `Archive ${archiveConfirmVehicle.registrationNumber}?`}
            </h3>
            <p className="text-sm text-slate-600">
              {archiveConfirmVehicle.status === 'Archived'
                ? 'Restoring this vehicle will return it to active fleet selection for daily logbook shifts.'
                : 'Archiving removes this vehicle from active shift selection while strictly preserving all historical daily logbook entries, earnings, and audit records.'}
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setArchiveConfirmVehicle(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmArchiveToggle}
                className="px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
              >
                {archiveConfirmVehicle.status === 'Archived'
                  ? 'Confirm Restore'
                  : 'Confirm Archive'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

