import React from 'react';
import DashboardMDMView from './views/DashboardMDMView';
import ItemsView from './views/ItemsView';
import TaxesView from './views/TaxesView';
import CategoriesView from './views/CategoriesView';
import SuppliersView from './views/SuppliersView';
import WarehousesView from './wms/WarehousesView';
import LocationsView from './wms/LocationsView';
import OutletsView from './pos/OutletsView';
import POSProductConfigView from './pos/POSProductConfigView';
import TerminalsConfig from '../pages/backoffice/TerminalsConfig';
import OperationConfigView from './pos/OperationConfigView';
import BillOfMaterialsView from './wms/BillOfMaterialsView';
import StockLevelsView from './wms/StockLevelsView';
import StockMovementsView from './wms/StockMovementsView';
import EdcInboxView from './views/EdcInboxView';
import RolesView from './views/auth/RolesView';
import PermissionsMatrixView from './views/auth/PermissionsMatrixView';
import ContextRulesView from './views/auth/ContextRulesView';
import CollaboratorsList from '../pages/backoffice/workforce/CollaboratorsList';
import POSOperatorsView from '../pages/backoffice/workforce/POSOperatorsView';
import ShiftsView from '../pages/backoffice/workforce/ShiftsView';
import DepartmentsView from '../pages/backoffice/workforce/DepartmentsView';

export const TabContext = React.createContext<{ onClose?: () => void }>({});

interface MainContentProps {
  activeView: string;
  onClose?: () => void;
}

export default function MainContent({ activeView, onClose }: MainContentProps) {
  const renderView = () => {
    switch (activeView) {
      case 'dashboard': return <DashboardMDMView />;
      case 'items': return <ItemsView />;
      case 'categories': return <CategoriesView />;
      case 'brands': return <div className="p-4">Marcas (Em Desenvolvimento)</div>;
      case 'suppliers': return <SuppliersView />;
      case 'taxes': return <TaxesView />;
      case 'uoms': return <div className="p-4">Unidades de Medida (Em Desenvolvimento)</div>;
      case 'warehouses': return <WarehousesView />;
      case 'outlets': return <OutletsView />;
      case 'pos_terminals': return <TerminalsConfig />;
      case 'pos_product_config': return <POSProductConfigView />;
      case 'operation_config': return <OperationConfigView />;
      case 'locations':
      case 'zones':
      case 'aisles':
      case 'racks':
      case 'shelves':
      case 'bins': return <LocationsView />;
      case 'bom': return <BillOfMaterialsView />;
      case 'stock_levels': return <StockLevelsView />;
      case 'stock_movements': return <StockMovementsView />;
      case 'inventory_dashboard': return <div className="p-4">Gestão de Inventário (Em Desenvolvimento)</div>;
      case 'inventory_recipes': return <div className="p-4">Fichas Técnicas / Receitas (Em Desenvolvimento)</div>;
      case 'inventory_stock': return <div className="p-4">Controlo de Stock (Em Desenvolvimento)</div>;
      case 'procurement_suppliers': return <div className="p-4">Gestão de Fornecedores (Em Desenvolvimento)</div>;
      case 'procurement_pos': return <div className="p-4">Gestão de Encomendas (Em Desenvolvimento)</div>;
      case 'procurement_grns': return <div className="p-4">Receção de Mercadorias (Em Desenvolvimento)</div>;
      case 'hr_collaborators': return <CollaboratorsList />;
      case 'hr_pos_operators': return <POSOperatorsView />;
      case 'hr_shifts': return <ShiftsView />;
      case 'hr_departments': return <DepartmentsView />;
      case 'edc_inbox': return <EdcInboxView onClose={onClose || (() => {})} />;
      case 'auth_roles': return <RolesView />;
      case 'auth_matrix': return <PermissionsMatrixView />;
      case 'auth_abac': return <ContextRulesView />;
      default: return (
        <div className="flex items-center justify-center h-full text-gray-400">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-2">Em Construção</h2>
            <p>O módulo selecionado ainda não está implementado.</p>
          </div>
        </div>
      );
    }
  };

  return (
    <TabContext.Provider value={{ onClose }}>
      <div className="flex-1 flex flex-col bg-white relative">
        {renderView()}
      </div>
    </TabContext.Provider>
  );
}
